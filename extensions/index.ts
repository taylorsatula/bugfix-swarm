// bugfix-swarm — the single Pi extension bundling the swarm's runtime needs.
//
// Registers two things:
// - the seven-skill corpus under skills/ (USER-GATED doctrine travels in the
//   skill descriptions themselves; nothing here injects content)
// - the checkbox_picker tool the runbook's Phase 7 pickers drive

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { installCheckboxPickerTool } from './checkbox-picker/tool.ts'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export default function bugfixSwarm(pi: ExtensionAPI): void {
  pi.on('resources_discover', async () => ({
    skillPaths: [resolve(packageRoot, 'skills')],
  }))

  installCheckboxPickerTool(pi)
}
