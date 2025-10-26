'use client'

import { useState } from 'react'

import { Button } from '@/lib/components/ui/button'
import { Card } from '@/lib/components/ui/card'
import { Input } from '@/lib/components/ui/input'
import { useAuthContext } from '@/lib/providers/auth-provider'
import { log } from '@/lib/utils/logger'

import { useWaitlist } from '../hooks/use-waitlist'

interface WaitlistSignupProps {
  onSuccess?: () => void
}

export function WaitlistSignup({ onSuccess }: WaitlistSignupProps) {
  const { isAuthenticated, signInWithGoogle } = useAuthContext()
  const { joinWaitlist, loading, error } = useWaitlist()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email.trim()) return

    try {
      setIsSubmitting(true)
      await joinWaitlist(email.trim())
      onSuccess?.()
    } catch (err) {
      log.error('Failed to join waitlist', err, 'WaitlistSignup')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignup = async () => {
    try {
      setIsSubmitting(true)
      await signInWithGoogle()
      onSuccess?.()
    } catch (err) {
      log.error('Failed to sign in with Google', err, 'WaitlistSignup')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isAuthenticated) {
    return null // User is already authenticated, don't show signup
  }

  return (
    <Card className="p-6 max-w-md mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">Join the Waitlist</h2>
        <p className="text-gray-600">
          Be the first to know when Printer launches
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting || !email.trim()}
        >
          {isSubmitting ? 'Joining...' : 'Join Waitlist'}
        </Button>
      </form>

      <div className="mt-4">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full mt-4"
          onClick={handleGoogleSignup}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Signing in...' : 'Continue with Google'}
        </Button>
      </div>
    </Card>
  )
}
