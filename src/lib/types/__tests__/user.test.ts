import type { UserStatus, UserRole } from '../user'

describe('User Types', () => {
  it('should have correct user status values', () => {
    const statuses: UserStatus[] = ['pending', 'waitlist', 'invited', 'active', 'suspended', 'banned']
    
    expect(statuses).toHaveLength(6)
    expect(statuses).toContain('active')
    expect(statuses).toContain('waitlist')
    expect(statuses).toContain('pending')
  })

  it('should have correct user role values', () => {
    const roles: UserRole[] = ['user', 'admin', 'super_admin']
    
    expect(roles).toHaveLength(3)
    expect(roles).toContain('user')
    expect(roles).toContain('admin')
    expect(roles).toContain('super_admin')
  })
})
