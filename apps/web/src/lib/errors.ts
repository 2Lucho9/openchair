/** Traduce los mensajes de Supabase Auth a algo que entienda quien usa la app. */
export function authErrorMessage(message: string | undefined | null): string {
  const m = (message ?? '').toLowerCase();
  if (!m) return 'Ocurrió un error. Intenta de nuevo.';
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Ese correo ya tiene una cuenta. Prueba iniciar sesión.';
  if (m.includes('email not confirmed')) return 'Falta confirmar tu correo. Revisa tu bandeja de entrada.';
  if (m.includes('password') && (m.includes('at least') || m.includes('weak') || m.includes('short')))
    return 'La contraseña es muy débil o muy corta (mínimo 8 caracteres).';
  if (m.includes('valid email') || m.includes('invalid email')) return 'Escribe un correo válido.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Demasiados intentos. Espera un momento y vuelve a probar.';
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'No hay conexión con el servidor. Revisa tu internet.';
  return 'No se pudo completar la acción: ' + (message ?? '');
}

export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Escribe un correo válido.';
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  return null;
}
