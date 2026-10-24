/** 青穗集 · Cubism Web 适配器：真实 MOC3 网格渲染、参数缓动、物理与短动作；不制造业务结果。 */
import { CubismFramework, Option, LogLevel } from '../vendor/live2d/framework/src/live2dcubismframework';
import { CubismUserModel } from '../vendor/live2d/framework/src/model/cubismusermodel';
import { CubismModelSettingJson } from '../vendor/live2d/framework/src/cubismmodelsettingjson';
import { CubismEyeBlink } from '../vendor/live2d/framework/src/effect/cubismeyeblink';
import { CubismMatrix44 } from '../vendor/live2d/framework/src/math/cubismmatrix44';
import { CubismShaderManager_WebGL } from '../vendor/live2d/framework/src/rendering/cubismshader_webgl';
import { CubismWebGLOffscreenManager } from '../vendor/live2d/framework/src/rendering/cubismoffscreenmanager';
import { ACubismMotion } from '../vendor/live2d/framework/src/motion/acubismmotion';
import { LIVE2D_PRESETS, clampUnit, safeCompanionState } from '../src/character/live2d';

const SHADERS = '/api/assets/live2d/shaders/';
const MOTIONS = ['nod','tilt','celebrate'];
const parameterNames = [...new Set([...Object.values(LIVE2D_PRESETS).flatMap(p=>Object.keys(p.params)), 'ParamEyeLOpen','ParamEyeROpen','ParamBreath','ParamMouthOpenY','ParamBodyAngleX','ParamBodyAngleZ'])];

async function bytes(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`素材加载失败 (${response.status}): ${new URL(url,location.href).pathname}`);
  return response.arrayBuffer();
}
function check(signal) { signal.throwIfAborted(); }
async function texture(gl, url, signal) {
  const response = await fetch(url,{signal});
  if(!response.ok) throw new Error(`贴图加载失败 (${response.status})`);
  const image = await createImageBitmap(await response.blob(),{premultiplyAlpha:'premultiply',imageOrientation:'none'});
  try {
    check(signal);
    const handle=gl.createTexture();
    if(!handle) throw new Error('无法创建角色贴图');
    gl.bindTexture(gl.TEXTURE_2D,handle);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D,null);
    return handle;
  } finally { image.close(); }
}

class Companion extends CubismUserModel {
  constructor(canvas, gl, onFrame, onError) {
    super();
    this.canvas=canvas; this.gl=gl; this.onFrame=onFrame; this.onError=onError;
    this.state='idle'; this.paused=false; this.tracking=true; this.pointer=[0,0]; this.mouth=0; this.zoom=1.7;
    this.destroyed=false; this.frame=0; this.elapsed=0; this.lastTime=0; this.raf=0;
    this.textures=[]; this.motions=new Map(); this.parameters=new Map(); this.values=new Map(); this.supportedMotions=[];
  }
  async prepare(modelUrl,signal) {
    const json=await bytes(modelUrl,signal);
    this.setting=new CubismModelSettingJson(json,json.byteLength);
    const base=new URL('.',new URL(modelUrl,location.href));
    const resolve=file=>new URL(file,base).href;
    const moc=await bytes(resolve(this.setting.getModelFileName()),signal);
    check(signal);
    this.loadModel(moc,true);
    if(!this.getModel()) throw new Error('模型损坏，或 MOC3 版本与 Core 不兼容');
    const model=this.getModel();
    this.defaults=new Map();
    for(let i=0;i<model.getParameterCount();i++) this.defaults.set(model.getParameterId(i).getString(),model.getParameterDefaultValue(i));
    for(const name of parameterNames) if(this.defaults.has(name)) this.parameters.set(name,CubismFramework.getIdManager().getId(name));
    this._eyeBlink=CubismEyeBlink.create(this.setting);
    for(const [file,load] of [[this.setting.getPhysicsFileName(), b=>this.loadPhysics(b,b.byteLength)],[this.setting.getPoseFileName(), b=>this.loadPose(b,b.byteLength)]]) {
      if(file) { const buffer=await bytes(resolve(file),signal); check(signal); load(buffer); }
    }
    for(const name of MOTIONS) {
      const buffer=await bytes(`/api/assets/live2d/motions/${name}.motion3.json`,signal);
      check(signal);
      const data=JSON.parse(new TextDecoder().decode(buffer));
      if(!data.Curves.every(curve=>this.defaults.has(curve.Id))) continue;
      const motion=this.loadMotion(buffer,buffer.byteLength,name);
      if(!motion) throw new Error(`动作文件无效: ${name}`);
      motion.setEffectIds([],[]); motion.setFadeInTime(.25); motion.setFadeOutTime(.25);
      this.motions.set(name,motion); this.supportedMotions.push(name);
    }
    this.createRenderer(this.canvas.width,this.canvas.height);
    this.getRenderer().startUp(this.gl);
    this.getRenderer().setIsPremultipliedAlpha(true);
    // Sequential ownership makes a cancelled/failed load fully releasable.
    for(let i=0;i<this.setting.getTextureCount();i++) {
      const handle=await texture(this.gl,resolve(this.setting.getTextureFileName(i)),signal);
      this.textures.push(handle); this.getRenderer().bindTexture(i,handle);
    }
    this.getRenderer().loadShaders(SHADERS);
    const start=performance.now();
    const shader=CubismShaderManager_WebGL.getInstance().getShader(this.gl);
    while(!shader._isShaderLoaded) {
      check(signal);
      if(performance.now()-start>12000) throw new Error('WebGL 着色器初始化超时，请重试或检查显卡支持');
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    check(signal);
    if(!shader._shaderSets[0]?.shaderProgram || !shader._shaderSets[1]?.shaderProgram) throw new Error('显卡无法编译 Live2D 着色器');
    this.resizeObserver=new ResizeObserver(()=>this.redraw());
    this.resizeObserver.observe(this.canvas);
    this.render(0,true);
    this.schedule();
    return { parameters:model.getParameterCount(),drawables:model.getDrawableCount(),missingParameters:parameterNames.filter(name=>!this.parameters.has(name)),supportedMotions:this.supportedMotions };
  }
  setState(state) { this.state=safeCompanionState(state); this.redraw(); }
  setPointer(x,y) { this.pointer=[Math.max(-1,Math.min(1,x)),Math.max(-1,Math.min(1,y))]; }
  setTracking(enabled) { this.tracking=Boolean(enabled); if(!enabled) this.pointer=[0,0]; this.redraw(); }
  setMouth(value) { this.mouth=clampUnit(value); this.redraw(); }
  setZoom(value) { this.zoom=Math.max(.8,Math.min(2.6,Number.isFinite(value)?value:1.7)); this.redraw(); }
  setPaused(paused) {
    this.paused=Boolean(paused); this.lastTime=0;
    cancelAnimationFrame(this.raf); this.raf=0;
    if(!this.paused) this.schedule();
  }
  playMotion(name) {
    const motion=this.motions.get(name);
    if(!motion || this.destroyed || this.paused) return false;
    this._motionManager.stopAllMotions();
    this.canvas.dataset.lastMotion=name; this.canvas.dataset.motionPeak="0";
    this._motionManager.startMotionPriority(motion,false,3);
    return true;
  }
  schedule() {
    if(this.destroyed || this.paused || this.raf) return;
    this.raf=requestAnimationFrame(time=>{
      this.raf=0;
      if(this.destroyed || this.paused) return;
      if(!this.lastTime || time-this.lastTime>=1000/30) {
        const dt=this.lastTime?Math.min((time-this.lastTime)/1000,.08):1/30;
        this.lastTime=time;
        try { this.render(dt,false); } catch(error) { this.setPaused(true); this.onError?.(error instanceof Error ? error.message : "角色动画更新失败"); return; }
      }
      this.schedule();
    });
  }
  redraw() { if(this.getModel() && !this.destroyed) this.render(0,this.paused); }
  render(dt,snap) {
    const gl=this.gl, model=this.getModel();
    if(!model || gl.isContextLost()) return;
    this.elapsed+=dt;
    model.loadParameters();
    const target=LIVE2D_PRESETS[this.state].params;
    for(const [name,id] of this.parameters) {
      let wanted=target[name]??this.defaults.get(name)??0;
      if(this.tracking && !this.paused) {
        if(name==='ParamEyeBallX') wanted+=this.pointer[0]*.35;
        if(name==='ParamEyeBallY') wanted+=this.pointer[1]*.3;
        if(name==='ParamAngleX') wanted+=this.pointer[0]*3;
      }
      const prior=this.values.get(name)??wanted;
      const value=snap?wanted:prior+(wanted-prior)*(1-Math.exp(-dt*6));
      this.values.set(name,value); model.setParameterValueById(id,value);
    }
    if(dt>0) {
      this._eyeBlink?.updateParameters(model,dt);
      model.setParameterValueById(CubismFramework.getIdManager().getId('ParamBreath'),.5+.5*Math.sin(this.elapsed*1.6));
      model.addParameterValueById(CubismFramework.getIdManager().getId('ParamBodyAngleX'),Math.sin(this.elapsed*.85)*.45);
      const motionUpdated=this._motionManager.updateMotion(model,dt);
      if(motionUpdated) {
        const peak=Math.max(Number(this.canvas.dataset.motionPeak||0),Math.abs(model.getParameterValueById(CubismFramework.getIdManager().getId("ParamAngleY"))),Math.abs(model.getParameterValueById(CubismFramework.getIdManager().getId("ParamAngleZ"))));
        this.canvas.dataset.motionPeak=String(peak);
      }
    }
    if(this.parameters.has('ParamMouthOpenY')) model.setParameterValueById(this.parameters.get('ParamMouthOpenY'),this.mouth);
    this._physics?.evaluate(model,dt);
    this._pose?.updateParameters(model,dt);
    model.update();
    const ratio=Math.min(devicePixelRatio||1,2);
    const width=Math.max(1,Math.round(this.canvas.clientWidth*ratio));
    const height=Math.max(1,Math.round(this.canvas.clientHeight*ratio));
    if(this.canvas.width!==width||this.canvas.height!==height) {
      this.canvas.width=width; this.canvas.height=height;
      this.setRenderTargetSize(width,height);
    }
    const aspect=width/height;
    // Use the actual model matrix: no rotating/scaling of a flattened portrait.
    const matrix=this.getModelMatrix();
    matrix.setHeight(2*this.zoom); matrix.translate(0,1-this.zoom);
    const projection=new CubismMatrix44(); projection.scale(1/aspect,1); projection.multiplyByMatrix(matrix);
    gl.viewport(0,0,width,height); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    this.getRenderer().setMvpMatrix(projection);
    this.getRenderer().setRenderState(null,[0,0,width,height]);
    CubismWebGLOffscreenManager.getInstance().beginFrameProcess(gl);
    this.getRenderer().drawModel(SHADERS);
    CubismWebGLOffscreenManager.getInstance().endFrameProcess(gl);
    this.canvas.dataset.frame=String(++this.frame);
    this.canvas.dataset.state=this.state;
    this.canvas.dataset.angleY=String(model.getParameterValueById(CubismFramework.getIdManager().getId('ParamAngleY')));
    this.onFrame?.(this.frame);
  }
  destroy() {
    if(this.destroyed) return;
    this.destroyed=true; cancelAnimationFrame(this.raf); this.resizeObserver?.disconnect();
    this._motionManager?.stopAllMotions();
    for(const motion of this.motions.values()) ACubismMotion.delete(motion);
    this.motions.clear();
    super.release();
    for(const handle of this.textures) this.gl.deleteTexture(handle);
    this.textures=[]; this.setting?.release();
  }
}

export async function createCompanion(canvas,options) {
  check(options.signal);
  if(!CubismFramework.isStarted()) {
    const option=new Option(); option.loggingLevel=LogLevel.LogLevel_Error;
    if(!CubismFramework.startUp(option)) throw new Error('Live2D Core 未就绪');
  }
  if(!CubismFramework.isInitialized()) CubismFramework.initialize();
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true});
  if(!gl) throw new Error('当前浏览器没有可用的 WebGL，请开启硬件加速后重试');
  const instance=new Companion(canvas,gl,options.onFrame,options.onError);
  try { const info=await instance.prepare(options.modelUrl,options.signal); return {controller:instance,info}; }
  catch(error) { instance.destroy(); throw error; }
}






