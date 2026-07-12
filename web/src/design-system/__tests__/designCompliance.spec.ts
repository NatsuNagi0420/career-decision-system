import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { NodeTypes, type RootNode, type TemplateChildNode } from '@vue/compiler-core'
import { describe, expect, it } from 'vitest'

const webRoot = process.cwd()

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

const businessFiles = [
  ...vueFiles(join(webRoot, 'src/pages')),
  ...vueFiles(join(webRoot, 'src/components'))
]

function walk(node: RootNode | TemplateChildNode, visit: (node: TemplateChildNode) => void, cardDepth = 0) {
  if (node.type === NodeTypes.ELEMENT) {
    visit(node)
    const nextDepth = cardDepth + (node.tag === 'M3Card' ? 1 : 0)
    if (node.tag === 'M3Card' && cardDepth > 0) throw new Error('M3Card cannot be nested')
    for (const child of node.children) walk(child, visit, nextDepth)
    return
  }
  if ('children' in node) for (const child of node.children) walk(child, visit, cardDepth)
}

describe('MD3 static design gate', () => {
  it.each(businessFiles)('%s uses project components and system tokens', (file) => {
    const source = readFileSync(file, 'utf8')
    const { descriptor } = parseSfc(source, { filename: file })
    const template = descriptor.template?.content || ''
    const style = descriptor.styles.map((item) => item.content).join('\n')

    expect(template).not.toMatch(/<(?:button|input|select|textarea)\b/i)
    expect(template).not.toMatch(/<md-[\w-]+\b/i)
    expect(source).not.toMatch(/element-plus|<el-|v-loading|--app-|--clay-|--el-/i)
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|(?:linear|radial)-gradient\(/i)
    expect(style).not.toMatch(/border-radius:\s*(?:\d|50%|100%)/i)
    expect(style).not.toMatch(/font-size:\s*\d+px/i)
    expect(style).not.toContain('!important')
    for (const match of style.matchAll(/box-shadow:\s*([^;]+)/gi)) {
      expect(match[1]?.trim(), `${file} has a literal box-shadow`).toMatch(/^var\(/)
    }

    if (!descriptor.template?.ast) return
    expect(() => walk(descriptor.template!.ast, (node) => {
      if (node.type !== NodeTypes.ELEMENT) return
      if (node.tag === 'M3IconButton') {
        const hasLabel = node.props.some((prop) =>
          (prop.type === NodeTypes.ATTRIBUTE && prop.name === 'label') ||
          (prop.type === NodeTypes.DIRECTIVE && prop.name === 'bind' && prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION && prop.arg.content === 'label')
        )
        expect(hasLabel, `${file} has an unlabeled M3IconButton`).toBe(true)
      }
      if (node.tag === 'img') {
        const hasAlt = node.props.some((prop) => prop.type === NodeTypes.ATTRIBUTE && prop.name === 'alt')
        expect(hasAlt, `${file} has an image without alt`).toBe(true)
      }
    })).not.toThrow()
  })

  it('has no Element Plus production dependency', () => {
    const packageJson = JSON.parse(readFileSync(join(webRoot, 'package.json'), 'utf8'))
    expect(packageJson.dependencies).not.toHaveProperty('element-plus')
    expect(packageJson.dependencies).not.toHaveProperty('@element-plus/icons-vue')
  })
})
