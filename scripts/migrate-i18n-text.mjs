/**
 * One-off: replace {{ t('key') }} / {{ t("key") }} with <I18nText k="key" /> in Vue SFC templates.
 * Skips AdminTranslationsView.vue. Does not handle t() with a second argument — fix those manually.
 */
import fs from 'node:fs'
import path from 'node:path'

const srcDir = path.join(process.cwd(), 'src')
const skip = new Set(['AdminTranslationsView.vue', 'I18nText.vue'])

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

const reSingle = /\{\{\s*t\(\s*'([^']+)'\s*\)\s*\}\}/g
const reDouble = /\{\{\s*t\(\s*"([^"]+)"\s*\)\s*\}\}/g

let total = 0
for (const file of walk(srcDir)) {
  if (skip.has(path.basename(file))) continue
  let s = fs.readFileSync(file, 'utf8')
  const orig = s
  s = s.replace(reSingle, '<I18nText k="$1" />')
  s = s.replace(reDouble, '<I18nText k="$1" />')
  if (s !== orig) {
    fs.writeFileSync(file, s)
    total++
    console.log('updated', path.relative(process.cwd(), file))
  }
}
console.log('files touched:', total)
