import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', '..')
const lucideIcons = path.join(root, 'web', 'node_modules', 'lucide-vue-next', 'dist', 'esm', 'icons')
const output = path.join(
  root,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'careerdecision',
  'mobile',
  'ui',
  'design',
  'CareerIcons.kt'
)

const icons = {
  Today: 'circle-check-big',
  Goal: 'flag',
  Mentor: 'sparkles',
  Profile: 'user-round',
  Login: 'log-in',
  Register: 'user-plus',
  Refresh: 'refresh-cw',
  MoreVertical: 'ellipsis-vertical',
  Play: 'play',
  Check: 'check',
  CalendarClock: 'calendar-clock',
  SkipForward: 'skip-forward',
  Link: 'link',
  Review: 'clipboard-check',
  Cloud: 'cloud',
  CloudOff: 'cloud-off',
  ExternalLink: 'external-link',
  Shield: 'shield-check',
  LogOut: 'log-out',
  ChevronLeft: 'chevron-left',
  ChevronRight: 'chevron-right',
  ChevronDown: 'chevron-down',
  Send: 'send',
  Plus: 'plus',
  Minus: 'minus',
  Bell: 'bell',
  Palette: 'palette',
  Image: 'image',
  Trash: 'trash-2',
  Settings: 'settings',
  MessageCircle: 'message-circle',
  Evidence: 'file-check-corner',
  Milestone: 'milestone',
  Map: 'map',
  Eye: 'eye',
  EyeOff: 'eye-off',
  NewChat: 'message-circle-plus',
  AlertCircle: 'circle-alert',
  AlertTriangle: 'triangle-alert',
  Info: 'info',
  Close: 'x',
  Menu: 'menu',
  ArrowLeft: 'arrow-left',
  ArrowRight: 'arrow-right',
  Clock: 'clock',
  Camera: 'camera',
  FileUp: 'file-up',
  Paperclip: 'paperclip',
  Moon: 'moon',
  Sun: 'sun',
  FollowSystem: 'monitor',
  Lock: 'lock-keyhole',
  Mail: 'mail',
  Save: 'save',
  Help: 'circle-question-mark',
  Bot: 'bot',
  History: 'history',
  WifiOff: 'wifi-off',
  Upload: 'upload',
  Download: 'download',
  Undo: 'rotate-ccw',
  ListTodo: 'list-todo',
  Notebook: 'notebook-pen'
}

function readNodes(iconFile) {
  const source = fs.readFileSync(path.join(lucideIcons, `${iconFile}.js`), 'utf8')
  const match = source.match(/createLucideIcon\("[^"]+",\s*(\[[\s\S]*\])\s*\);/)
  if (!match) throw new Error(`Cannot parse ${iconFile}`)
  return Function(`"use strict"; return (${match[1]})`)()
}

const number = (value) => Number.parseFloat(value ?? '0')
const fmt = (value) => Number.isInteger(value) ? String(value) : String(value)

function shapeToPath([tag, attributes]) {
  if (tag === 'path') return attributes.d
  if (tag === 'line') {
    return `M${attributes.x1} ${attributes.y1}L${attributes.x2} ${attributes.y2}`
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const points = attributes.points.trim().split(/\s+/).join('L')
    return `M${points}${tag === 'polygon' ? 'Z' : ''}`
  }
  if (tag === 'circle') {
    const cx = number(attributes.cx)
    const cy = number(attributes.cy)
    const r = number(attributes.r)
    return `M${fmt(cx - r)} ${fmt(cy)}A${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)}A${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)}`
  }
  if (tag === 'ellipse') {
    const cx = number(attributes.cx)
    const cy = number(attributes.cy)
    const rx = number(attributes.rx)
    const ry = number(attributes.ry)
    return `M${fmt(cx - rx)} ${fmt(cy)}A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)}A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)}`
  }
  if (tag === 'rect') {
    const x = number(attributes.x)
    const y = number(attributes.y)
    const width = number(attributes.width)
    const height = number(attributes.height)
    const radius = Math.min(number(attributes.rx ?? attributes.ry), width / 2, height / 2)
    if (!radius) return `M${x} ${y}H${x + width}V${y + height}H${x}Z`
    return `M${x + radius} ${y}H${x + width - radius}A${radius} ${radius} 0 0 1 ${x + width} ${y + radius}V${y + height - radius}A${radius} ${radius} 0 0 1 ${x + width - radius} ${y + height}H${x + radius}A${radius} ${radius} 0 0 1 ${x} ${y + height - radius}V${y + radius}A${radius} ${radius} 0 0 1 ${x + radius} ${y}Z`
  }
  throw new Error(`Unsupported Lucide SVG node: ${tag}`)
}

const definitions = Object.entries(icons).map(([property, iconFile]) => {
  const paths = readNodes(iconFile).map(shapeToPath)
  const pathList = paths.map((entry) => `            ${JSON.stringify(entry)}`).join(',\n')
  return `    val ${property}: ImageVector by lazy {\n        lucideIcon(\n            name = "${property}",\n            paths = listOf(\n${pathList}\n            )\n        )\n    }`
}).join('\n\n')

const generated = `// Generated from lucide-vue-next 0.577.0 (ISC License). Do not hand-edit.\npackage com.careerdecision.mobile.ui.design\n\nimport androidx.compose.ui.graphics.Color\nimport androidx.compose.ui.graphics.SolidColor\nimport androidx.compose.ui.graphics.StrokeCap\nimport androidx.compose.ui.graphics.StrokeJoin\nimport androidx.compose.ui.graphics.vector.ImageVector\nimport androidx.compose.ui.graphics.vector.PathParser\nimport androidx.compose.ui.unit.dp\n\nobject CareerIcons {\n${definitions}\n\n    val CheckCircle: ImageVector get() = Today\n    val Flag: ImageVector get() = Goal\n    val Sparkles: ImageVector get() = Mentor\n    val User: ImageVector get() = Profile\n    val UserPlus: ImageVector get() = Register\n    val ClipboardCheck: ImageVector get() = Review\n    val FileCheck: ImageVector get() = Evidence\n}\n\nprivate fun lucideIcon(name: String, paths: List<String>): ImageVector =\n    ImageVector.Builder(\n        name = "Lucide." + name,\n        defaultWidth = 24.dp,\n        defaultHeight = 24.dp,\n        viewportWidth = 24f,\n        viewportHeight = 24f\n    ).apply {\n        paths.forEach { pathData ->\n            addPath(\n                pathData = PathParser().parsePathString(pathData).toNodes(),\n                fill = null,\n                stroke = SolidColor(Color.Black),\n                strokeLineWidth = 2f,\n                strokeLineCap = StrokeCap.Round,\n                strokeLineJoin = StrokeJoin.Round\n            )\n        }\n    }.build()\n`

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, generated)
console.log(`Generated ${Object.keys(icons).length} Lucide icons at ${output}`)
