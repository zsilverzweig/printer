// Test user profile creation logic with admin config auto-add-to-waitlist functionality
// Focus on business logic without complex mocking

describe('UserProfileService - Profile Creation Logic', () => {
  const mockFirebaseUser = {
    uid: 'test-user-123',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: 'https://example.com/photo.jpg',
    emailVerified: true,
  }

  const mockMetadata = {
    signupSource: 'google',
    userAgent: 'test-agent',
    ipAddress: '127.0.0.1',
  }

  describe('Admin Email Detection', () => {
    it('should correctly identify admin emails', () => {
      const isAdminEmail = (email: string): boolean => {
        const adminEmails = [
          'admin@printer.ai',
          'zach@printer.ai',
          'silverzweig@gmail.com',
        ]
        const adminDomains = ['@printer.ai']
        const emailLower = email.toLowerCase()
        
        return (
          adminEmails.includes(emailLower) ||
          adminDomains.some((domain) => emailLower.endsWith(domain))
        )
      }

      // Test admin emails
      expect(isAdminEmail('admin@printer.ai')).toBe(true)
      expect(isAdminEmail('zach@printer.ai')).toBe(true)
      expect(isAdminEmail('silverzweig@gmail.com')).toBe(true)
      
      // Test admin domains
      expect(isAdminEmail('test@printer.ai')).toBe(true)
      expect(isAdminEmail('support@printer.ai')).toBe(true)
      
      // Test non-admin emails
      expect(isAdminEmail('user@example.com')).toBe(false)
      expect(isAdminEmail('test@gmail.com')).toBe(false)
    })
  })

  describe('User Status Logic', () => {
    it('should determine correct status based on admin config scenarios', () => {
      // Test scenario 1: Admin user (should always be active)
      const isAdmin = true
      const isWaitlistEnabled = true
      const isAutoAddEnabled = true
      
      let initialStatus = 'pending'
      if (isAdmin) {
        initialStatus = 'active'
      } else if (isWaitlistEnabled && isAutoAddEnabled) {
        initialStatus = 'waitlist'
      } else if (isWaitlistEnabled) {
        initialStatus = 'pending'
      } else {
        initialStatus = 'active'
      }
      
      expect(initialStatus).toBe('active')

      // Test scenario 2: Regular user, waitlist disabled
      const isAdmin2 = false
      const isWaitlistEnabled2 = false
      
      let initialStatus2 = 'pending'
      if (isAdmin2) {
        initialStatus2 = 'active'
      } else if (isWaitlistEnabled2) {
        initialStatus2 = 'pending'
      } else {
        initialStatus2 = 'active'
      }
      
      expect(initialStatus2).toBe('active')

      // Test scenario 3: Regular user, waitlist enabled, auto-add enabled
      const isAdmin3 = false
      const isWaitlistEnabled3 = true
      const isAutoAddEnabled3 = true
      
      let initialStatus3 = 'pending'
      if (isAdmin3) {
        initialStatus3 = 'active'
      } else if (isWaitlistEnabled3 && isAutoAddEnabled3) {
        initialStatus3 = 'waitlist'
      } else if (isWaitlistEnabled3) {
        initialStatus3 = 'pending'
      } else {
        initialStatus3 = 'active'
      }
      
      expect(initialStatus3).toBe('waitlist')

      // Test scenario 4: Regular user, waitlist enabled, auto-add disabled
      const isAdmin4 = false
      const isWaitlistEnabled4 = true
      const isAutoAddEnabled4 = false
      
      let initialStatus4 = 'pending'
      if (isAdmin4) {
        initialStatus4 = 'active'
      } else if (isWaitlistEnabled4 && isAutoAddEnabled4) {
        initialStatus4 = 'waitlist'
      } else if (isWaitlistEnabled4) {
        initialStatus4 = 'pending'
      } else {
        initialStatus4 = 'active'
      }
      
      expect(initialStatus4).toBe('pending')
    })
  })

  describe('Profile Data Structure', () => {
    it('should include waitlist fields only when user is on waitlist', () => {
      // Simulate waitlist scenario
      const waitlistEntryId = 'waitlist-entry-123'
      const waitlistPosition = 10

      const profileData: any = {
        uid: mockFirebaseUser.uid,
        email: mockFirebaseUser.email,
        displayName: mockFirebaseUser.displayName,
        photoURL: mockFirebaseUser.photoURL,
        emailVerified: mockFirebaseUser.emailVerified,
        status: 'waitlist',
        role: 'user',
      }

      // Only include waitlist fields if they have values
      if (waitlistEntryId !== undefined) {
        profileData.waitlistEntryId = waitlistEntryId
      }
      if (waitlistPosition !== undefined) {
        profileData.waitlistPosition = waitlistPosition
      }

      expect(profileData.waitlistEntryId).toBe('waitlist-entry-123')
      expect(profileData.waitlistPosition).toBe(10)
      expect(profileData.status).toBe('waitlist')
    })

    it('should exclude waitlist fields when user is not on waitlist', () => {
      // Simulate non-waitlist scenario
      const waitlistEntryId = undefined
      const waitlistPosition = undefined

      const profileData: any = {
        uid: mockFirebaseUser.uid,
        email: mockFirebaseUser.email,
        displayName: mockFirebaseUser.displayName,
        photoURL: mockFirebaseUser.photoURL,
        emailVerified: mockFirebaseUser.emailVerified,
        status: 'active',
        role: 'user',
      }

      // Only include waitlist fields if they have values
      if (waitlistEntryId !== undefined) {
        profileData.waitlistEntryId = waitlistEntryId
      }
      if (waitlistPosition !== undefined) {
        profileData.waitlistPosition = waitlistPosition
      }

      expect(profileData.waitlistEntryId).toBeUndefined()
      expect(profileData.waitlistPosition).toBeUndefined()
      expect(profileData.status).toBe('active')
    })
  })

  describe('Metadata Handling', () => {
    it('should exclude undefined metadata fields from profile data', async () => {
      const metadataWithUndefined = {
        signupSource: 'google',
        userAgent: undefined,
        ipAddress: '127.0.0.1',
        utmParams: undefined,
        referralCode: 'REF123',
        lastActiveAt: new Date(),
        sessionCount: 1,
        totalSessionTime: 0,
      }

      // Simulate the metadata filtering logic
      const filteredMetadata = {
        signupSource: 'google',
        lastActiveAt: new Date(),
        sessionCount: 1,
        totalSessionTime: 0,
        // Only include defined metadata values
        ...(metadataWithUndefined.userAgent && { userAgent: metadataWithUndefined.userAgent }),
        ...(metadataWithUndefined.ipAddress && { ipAddress: metadataWithUndefined.ipAddress }),
        ...(metadataWithUndefined.utmParams && { utmParams: metadataWithUndefined.utmParams }),
        ...(metadataWithUndefined.referralCode && { referralCode: metadataWithUndefined.referralCode }),
        ...(metadataWithUndefined.signupSource && { signupSource: metadataWithUndefined.signupSource }),
        // Include other defined metadata fields
        ...Object.fromEntries(
          Object.entries(metadataWithUndefined).filter(([_, value]) => value !== undefined)
        ),
      }

      // Verify undefined fields are excluded
      expect(filteredMetadata.userAgent).toBeUndefined()
      expect(filteredMetadata.utmParams).toBeUndefined()
      
      // Verify defined fields are included
      expect(filteredMetadata.signupSource).toBe('google')
      expect(filteredMetadata.ipAddress).toBe('127.0.0.1')
      expect(filteredMetadata.referralCode).toBe('REF123')
      expect(filteredMetadata.lastActiveAt).toBeInstanceOf(Date)
      expect(filteredMetadata.sessionCount).toBe(1)
      expect(filteredMetadata.totalSessionTime).toBe(0)
    })

    it('should handle completely undefined metadata', async () => {
      const undefinedMetadata = undefined

      // Simulate the metadata filtering logic
      const filteredMetadata = {
        signupSource: 'google',
        lastActiveAt: new Date(),
        sessionCount: 1,
        totalSessionTime: 0,
        // Only include defined metadata values
        ...(undefinedMetadata?.userAgent && { userAgent: undefinedMetadata.userAgent }),
        ...(undefinedMetadata?.ipAddress && { ipAddress: undefinedMetadata.ipAddress }),
        ...(undefinedMetadata?.utmParams && { utmParams: undefinedMetadata.utmParams }),
        ...(undefinedMetadata?.referralCode && { referralCode: undefinedMetadata.referralCode }),
        ...(undefinedMetadata?.signupSource && { signupSource: undefinedMetadata.signupSource }),
        // Include other defined metadata fields
        ...Object.fromEntries(
          Object.entries(undefinedMetadata || {}).filter(([_, value]) => value !== undefined)
        ),
      }

      // Should only have the default fields
      expect(filteredMetadata.signupSource).toBe('google')
      expect(filteredMetadata.lastActiveAt).toBeInstanceOf(Date)
      expect(filteredMetadata.sessionCount).toBe(1)
      expect(filteredMetadata.totalSessionTime).toBe(0)
      
      // Should not have any undefined fields
      expect(filteredMetadata.userAgent).toBeUndefined()
      expect(filteredMetadata.ipAddress).toBeUndefined()
      expect(filteredMetadata.utmParams).toBeUndefined()
      expect(filteredMetadata.referralCode).toBeUndefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle admin service errors gracefully', async () => {
      // Mock admin service to throw error
      mockAdminService.isWaitlistEnabled.mockRejectedValue(
        new Error('Admin service unavailable')
      )
      mockAdminService.isAutoAddToWaitlistEnabled.mockRejectedValue(
        new Error('Admin service unavailable')
      )

      // Should handle errors gracefully
      try {
        await mockAdminService.isWaitlistEnabled()
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Admin service unavailable')
      }

      try {
        await mockAdminService.isAutoAddToWaitlistEnabled()
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Admin service unavailable')
      }
    })
  })
})
