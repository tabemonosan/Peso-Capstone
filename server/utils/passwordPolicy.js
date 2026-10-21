// Re-export the shared client policy for server use (no DOM dependencies inside)
export { validatePassword, isPasswordValid, passwordErrorMessage, PASSWORD_RULES } from '../../src/utils/passwordPolicy.js'
