/** 青穗集 · 穗奈入门气泡：复用透明素材，跟随真实控件定位，不代替用户操作。 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { SUINAI_AVATAR_URL } from "../assets";
import { AgentIcon } from "./AgentIcon";
import { clipTourTarget, onboardingSteps, placeTourPanel, type TourRect, type TourViewport } from "./onboarding";
import "./onboarding.css";
function viewport(): TourViewport {
  const visual = window.visualViewport;
  return { width: visual?.width ?? window.innerWidth, height: visual?.height ?? window.innerHeight, x: visual?.offsetLeft ?? 0, y: visual?.offsetTop ?? 0 };
}
function findTarget(id: string, view: TourViewport) {
  for (const element of document.querySelectorAll<HTMLElement>(`[data-onboarding="${id}"]`)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && element.getClientRects().length) {
      const clipped = clipTourTarget({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }, view);
      if (clipped) return { element, rect: clipped };
    }
  }
  return null;
}
export function OnboardingTour({ step, mode, animated, onStep, onFinish }: { step: number; mode: "local" | "server"; animated: boolean; onStep: (step: number) => void; onFinish: (status: "completed" | "skipped") => void }) {
  const dialog = useRef<HTMLDialogElement>(null), card = useRef<HTMLDivElement>(null), primary = useRef<HTMLButtonElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  const heading = useId(), description = useId();
  const steps = onboardingSteps(mode);
  const item = steps[step], isLast = step === steps.length - 1;
  const [layout, setLayout] = useState<{ target: TourRect | null; panel: ReturnType<typeof placeTourPanel> } | null>(null);
  useEffect(() => {
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const current = dialog.current;
    if (current && !current.open) current.showModal();
    primary.current?.focus({ preventScroll: true });
    return () => { current?.close(); if (previous.current?.isConnected) previous.current.focus({ preventScroll: true }); };
  }, []);
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const view = viewport(), found = findTarget(item.id, view), bounds = card.current?.getBoundingClientRect();
      const size = { width: bounds?.width || Math.min(432, view.width - 24), height: bounds?.height || 244 };
      setLayout({ target: found?.rect ?? null, panel: placeTourPanel(found?.rect ?? null, view, size, item.side) });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    if (card.current) observer.observe(card.current);
    const target = findTarget(item.id, viewport());
    if (target) observer.observe(target.element);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    measure(); primary.current?.focus({ preventScroll: true });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedule); document.removeEventListener("scroll", schedule, true); window.visualViewport?.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("scroll", schedule); };
  }, [item.id, item.side]);
  const positioned = Boolean(layout);
  useEffect(() => { if (positioned && dialog.current?.open) primary.current?.focus({ preventScroll: true }); }, [positioned]);
  const target = layout?.target;
  return createPortal(<dialog ref={dialog} className="onboarding-tour" role="dialog" aria-label="穗奈使用引导" aria-modal="true" aria-labelledby={heading} aria-describedby={description} data-animated={animated} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const first = buttons[0], last = buttons.at(-1), current = document.activeElement;
      if (event.shiftKey && (current === first || !buttons.includes(current as HTMLButtonElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (current === last || !buttons.includes(current as HTMLButtonElement))) { event.preventDefault(); first?.focus(); }
    }} onCancel={event => { event.preventDefault(); onFinish("skipped"); }}>
    <div className="onboarding-tour__shade" data-has-target={Boolean(target)} />
    {target && <div className="onboarding-tour__spotlight" aria-hidden="true" style={{ left: target.x, top: target.y, width: target.width, height: target.height }}><i /><i /><i /><i /></div>}
    <div ref={card} className="onboarding-tour__card" data-side={layout?.panel.side ?? "none"} data-positioned={Boolean(layout)} style={{ left: layout?.panel.x ?? 12, top: layout?.panel.y ?? 12, "--tour-arrow": `${layout?.panel.arrow ?? 0}px` } as CSSProperties}>
      <span className="onboarding-tour__tail" aria-hidden="true" />
      <header className="onboarding-tour__header"><span className="onboarding-tour__speaker"><img src={SUINAI_AVATAR_URL} alt="" width="38" height="38" /><span>穗奈</span></span><button type="button" className="onboarding-tour__skip" onClick={() => onFinish("skipped")}>跳过<AgentIcon name="close" size={13} /></button></header>
      <div className="onboarding-tour__copy" key={step} aria-live="polite" aria-atomic="true"><h2 id={heading}>{item.title}</h2><p id={description}>{item.text}</p></div>
      <footer className="onboarding-tour__footer"><nav aria-label="引导步骤">{steps.map((value, index) => <button key={value.id} type="button" aria-label={`第 ${index + 1} 步：${value.title}`} aria-current={step === index ? "step" : undefined} onClick={() => onStep(index)}><span /></button>)}</nav><div className="onboarding-tour__actions">{step > 0 && <button className="onboarding-tour__back" type="button" onClick={() => onStep(step - 1)} aria-label="上一步"><AgentIcon name="chevron" size={16} /></button>}<button ref={primary} className="onboarding-tour__next" type="button" onClick={() => isLast ? onFinish("completed") : onStep(step + 1)}>{isLast ? "开始聊聊" : "下一步"}<AgentIcon name={isLast ? "check" : "chevron"} size={16} /></button></div></footer>
    </div>
  </dialog>, document.body);
}
