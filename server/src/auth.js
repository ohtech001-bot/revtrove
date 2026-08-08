import jwt from 'jsonwebtoken'

const secret = () => {
  const value = process.env.JWT_SECRET
  if (!value || value.length < 32) throw new Error('JWT_SECRET must be at least 32 characters')
  return value
}

export function signAdmin(admin) {
  return jwt.sign({ sub: admin.id, role: 'admin', email: admin.email }, secret(), { expiresIn: '8h', issuer: 'revtrove' })
}

export function requireAdmin(req, res, next) {
  const header = req.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  try {
    const payload = jwt.verify(token, secret(), { issuer: 'revtrove' })
    if (payload.role !== 'admin') throw new Error('invalid role')
    req.admin = payload
    next()
  } catch {
    res.status(401).json({ error: 'unauthorized' })
  }
}
