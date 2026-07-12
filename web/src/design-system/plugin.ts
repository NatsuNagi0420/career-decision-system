import type { App, Component } from 'vue'
import * as components from './components'

export const CareerDesignSystem = {
  install(app: App) {
    for (const [name, component] of Object.entries(components)) {
      app.component(name, component as Component)
    }
  }
}
