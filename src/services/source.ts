import { LocalSource } from './localSource'

let instance: LocalSource | undefined

/** Os dados do app ficam sempre neste aparelho; a conta na nuvem só sincroniza uma cópia. */
export function getSource(): LocalSource {
  instance ??= new LocalSource()
  return instance
}
