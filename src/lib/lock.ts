import { BiometricAuth } from '@aparajita/capacitor-biometric-auth'

const KEY = 'oc:lock'
export const lockEnabled = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
export const setLockEnabled = (on: boolean) => { try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY) } catch { /* ignora */ } }

/** Biometria cadastrada ou, ao menos, PIN/padrão/senha do aparelho. */
export async function lockAvailable() {
  try { const info = await BiometricAuth.checkBiometry(); return info.isAvailable || info.deviceIsSecure } catch { return false }
}

export async function authenticate(reason: string) {
  try {
    await BiometricAuth.authenticate({ reason, cancelTitle: 'Cancelar', allowDeviceCredential: true, androidTitle: 'Cadence', androidSubtitle: 'Confirme que é você' })
    return true
  } catch { return false }
}
