// Tests for StripeService
import { StripeService } from '../stripe'

// Mock fetch globally
global.fetch = jest.fn()

// Mock logger
jest.mock('@/lib/utils/logger', () => ({
  log: {
    success: jest.fn(),
    failure: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }
}))

describe('StripeService', () => {
  let service: StripeService
  const mockFetch = fetch as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    service = StripeService.getInstance()
    jest.clearAllMocks()
  })

  describe('createCheckoutSession', () => {
    it('should create checkout session successfully', async () => {
      const mockResponse = {
        sessionId: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123'
      }

      const mockFetchResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      }

      mockFetch.mockResolvedValue(mockFetchResponse as any)

      const params = {
        userId: 'user123',
        waitlistEntryId: 'entry123',
        positions: 3,
        amount: 30,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel'
      }

      const result = await service.createCheckoutSession(params)

      expect(result).toEqual(mockResponse)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/stripe/create-checkout-session',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(params)
        }
      )
    })

    it('should handle HTTP error responses', async () => {
      const mockFetchResponse = {
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({ error: 'Invalid parameters' })
      }

      mockFetch.mockResolvedValue(mockFetchResponse as any)

      const params = {
        userId: 'user123',
        waitlistEntryId: 'entry123',
        positions: 3,
        amount: 30,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel'
      }

      await expect(service.createCheckoutSession(params)).rejects.toThrow()
    })

    it('should handle network errors', async () => {
      const networkError = new Error('Network error')
      mockFetch.mockRejectedValue(networkError)

      const params = {
        userId: 'user123',
        waitlistEntryId: 'entry123',
        positions: 3,
        amount: 30,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel'
      }

      await expect(service.createCheckoutSession(params)).rejects.toThrow('Network error')
    })
  })

  describe('redirectToCheckout', () => {
    beforeEach(() => {
      // Mock window.location for redirectToCheckout test
      Object.defineProperty(window, 'location', {
        value: {
          origin: 'https://example.com'
        },
        writable: true
      })
    })

    it('should redirect to checkout successfully', async () => {
      const mockStripe = {
        redirectToCheckout: jest.fn().mockResolvedValue({ error: null })
      }

      // Mock the Stripe initialization
      const mockLoadStripe = jest.fn().mockResolvedValue(mockStripe)
      jest.doMock('@stripe/stripe-js', () => ({
        loadStripe: mockLoadStripe
      }))

      await service.redirectToCheckout('cs_test_123')

      expect(mockStripe.redirectToCheckout).toHaveBeenCalledWith({
        sessionId: 'cs_test_123'
      })
    })

    it('should handle Stripe initialization failure', async () => {
      const mockLoadStripe = jest.fn().mockResolvedValue(null)
      jest.doMock('@stripe/stripe-js', () => ({
        loadStripe: mockLoadStripe
      }))

      await expect(service.redirectToCheckout('cs_test_123')).rejects.toThrow(
        'Stripe failed to initialize'
      )
    })

    it('should handle Stripe redirect error', async () => {
      const stripeError = new Error('Card declined')
      const mockStripe = {
        redirectToCheckout: jest.fn().mockResolvedValue({ error: stripeError })
      }

      const mockLoadStripe = jest.fn().mockResolvedValue(mockStripe)
      jest.doMock('@stripe/stripe-js', () => ({
        loadStripe: mockLoadStripe
      }))

      await expect(service.redirectToCheckout('cs_test_123')).rejects.toThrow(
        'Card declined'
      )
    })
  })

  describe('purchasePositions', () => {
    it('should create session and redirect to checkout', async () => {
      const mockSessionResponse = {
        sessionId: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123'
      }

      const mockFetchResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(mockSessionResponse)
      }

      mockFetch.mockResolvedValue(mockFetchResponse as any)

      const mockStripe = {
        redirectToCheckout: jest.fn().mockResolvedValue({ error: null })
      }

      const mockLoadStripe = jest.fn().mockResolvedValue(mockStripe)
      jest.doMock('@stripe/stripe-js', () => ({
        loadStripe: mockLoadStripe
      }))

      const params = {
        userId: 'user123',
        waitlistEntryId: 'entry123',
        positions: 3,
        amount: 30,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel'
      }

      await service.purchasePositions(params)

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/stripe/create-checkout-session',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(params)
        })
      )

      expect(mockStripe.redirectToCheckout).toHaveBeenCalledWith({
        sessionId: 'cs_test_123'
      })
    })
  })

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = StripeService.getInstance()
      const instance2 = StripeService.getInstance()

      expect(instance1).toBe(instance2)
    })
  })
})
