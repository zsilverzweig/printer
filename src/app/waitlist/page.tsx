'use client'

import { WaitlistDashboard } from '@/features/waitlist/components/waitlist-dashboard'
import { WaitlistSignup } from '@/features/waitlist/components/waitlist-signup'
import { useAuthContext } from '@/lib/providers/auth-provider'
import { useState } from 'react'

export default function WaitlistPage() {
  const { isAuthenticated, loading: authLoading } = useAuthContext()
  const [showSignup, setShowSignup] = useState(false)

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Join the Printer Waitlist
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Be among the first to experience AI-powered investment research that produces 
            actionable, company-level investment theses through structured reasoning.
          </p>
        </div>

        {/* Main Content */}
        {!isAuthenticated ? (
          <div className="flex justify-center">
            {showSignup ? (
              <WaitlistSignup onSuccess={() => setShowSignup(false)} />
            ) : (
              <div className="text-center">
                <div className="mb-8">
                  <h2 className="text-2xl font-semibold mb-4">Get Early Access</h2>
                  <p className="text-gray-600 mb-6">
                    Join our waitlist to be notified when Printer launches and get early access to our AI investment research platform.
                  </p>
                </div>
                <button
                  onClick={() => setShowSignup(true)}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Join Waitlist
                </button>
              </div>
            )}
          </div>
        ) : (
          <WaitlistDashboard onJoinWaitlist={() => setShowSignup(true)} />
        )}

        {/* Features Section */}
        <div className="mt-16">
          <h2 className="text-3xl font-bold text-center mb-12">
            What You'll Get Access To
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">AI-Powered Research</h3>
              <p className="text-gray-600">
                Advanced AI agents that conduct comprehensive company research and analysis
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Investment Theses</h3>
              <p className="text-gray-600">
                Structured investment theses with risk assessment and market analysis
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Market Intelligence</h3>
              <p className="text-gray-600">
                Real-time market analysis and competitive intelligence
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-16 text-center bg-blue-50 rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-gray-600 mb-6">
            Join thousands of investors who are already on our waitlist
          </p>
          {!isAuthenticated && (
            <button
              onClick={() => setShowSignup(true)}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Join Waitlist Now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
