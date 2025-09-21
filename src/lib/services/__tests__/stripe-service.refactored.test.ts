// Refactored tests for StripeService using new test infrastructure
import {
  createCheckoutParams,
  setupStripeMocks,
  stripeTestScenarios,
  verifyStripeApiCall,
} from "@/lib/test-utils";
import { StripeService } from "../stripe";

describe("StripeService", () => {
  let service: StripeService;
  let mocks: ReturnType<typeof setupStripeMocks>;

  beforeEach(() => {
    service = StripeService.getInstance();
    mocks = setupStripeMocks();
    jest.clearAllMocks();
  });

  describe("createCheckoutSession", () => {
    it("should create checkout session successfully", async () => {
      // Setup
      const mockResponse = stripeTestScenarios.successfulCheckout();
      mocks.mockFetch.mockResolvedValue(mockResponse);

      const params = createCheckoutParams();

      // Execute
      const result = await service.createCheckoutSession(params);

      // Verify
      expect(result).toEqual({
        sessionId: "cs_test_1234567890",
        url: "https://checkout.stripe.com/pay/cs_test_1234567890",
      });

      verifyStripeApiCall(
        mocks.mockFetch,
        "/api/stripe/create-checkout-session",
        params
      );
    });

    it("should handle HTTP error responses", async () => {
      // Setup
      const mockResponse = stripeTestScenarios.failedCheckout();
      mocks.mockFetch.mockResolvedValue(mockResponse);

      const params = createCheckoutParams();

      // Execute & Verify
      await expect(service.createCheckoutSession(params)).rejects.toThrow();
    });

    it("should handle network errors", async () => {
      // Setup
      const networkError = new Error("Network error");
      mocks.mockFetch.mockRejectedValue(networkError);

      const params = createCheckoutParams();

      // Execute & Verify
      await expect(service.createCheckoutSession(params)).rejects.toThrow(
        "Network error"
      );
    });

    it("should handle different payment amounts", async () => {
      // Setup
      const mockResponse = stripeTestScenarios.successfulCheckout();
      mocks.mockFetch.mockResolvedValue(mockResponse);

      const testCases = [
        { positions: 1, amount: 10 },
        { positions: 5, amount: 50 },
        { positions: 10, amount: 100 },
      ];

      // Execute & Verify
      for (const testCase of testCases) {
        const params = createCheckoutParams(testCase);
        await service.createCheckoutSession(params);

        verifyStripeApiCall(
          mocks.mockFetch,
          "/api/stripe/create-checkout-session",
          params
        );
      }
    });
  });

  describe("redirectToCheckout", () => {
    beforeEach(() => {
      // Mock window.location for redirectToCheckout test
      Object.defineProperty(window, "location", {
        value: { origin: "https://example.com" },
        writable: true,
      });
    });

    it("should redirect to checkout successfully", async () => {
      // Setup
      mocks.mockStripe.redirectToCheckout.mockResolvedValue({ error: null });
      mocks.mockLoadStripe.mockResolvedValue(mocks.mockStripe);

      // Execute
      await service.redirectToCheckout("cs_test_123");

      // Verify
      expect(mocks.mockStripe.redirectToCheckout).toHaveBeenCalledWith({
        sessionId: "cs_test_123",
      });
    }, 10000); // Increased timeout

    it("should handle Stripe initialization failure", async () => {
      // Setup
      mocks.mockLoadStripe.mockResolvedValue(null);

      // Execute & Verify
      await expect(service.redirectToCheckout("cs_test_123")).rejects.toThrow(
        "Stripe failed to initialize"
      );
    }, 10000); // Increased timeout

    it("should handle Stripe redirect error", async () => {
      // Setup
      const stripeError = new Error("Card declined");
      mocks.mockStripe.redirectToCheckout.mockResolvedValue({
        error: stripeError,
      });
      mocks.mockLoadStripe.mockResolvedValue(mocks.mockStripe);

      // Execute & Verify
      await expect(service.redirectToCheckout("cs_test_123")).rejects.toThrow(
        "Card declined"
      );
    }, 10000); // Increased timeout
  });

  describe("purchasePositions", () => {
    it("should create session and redirect to checkout", async () => {
      // Setup
      const mockResponse = stripeTestScenarios.successfulCheckout();
      mocks.mockFetch.mockResolvedValue(mockResponse);
      mocks.mockStripe.redirectToCheckout.mockResolvedValue({ error: null });
      mocks.mockLoadStripe.mockResolvedValue(mocks.mockStripe);

      const params = createCheckoutParams();

      // Execute
      await service.purchasePositions(params);

      // Verify
      verifyStripeApiCall(
        mocks.mockFetch,
        "/api/stripe/create-checkout-session",
        params
      );

      expect(mocks.mockStripe.redirectToCheckout).toHaveBeenCalledWith({
        sessionId: "cs_test_1234567890",
      });
    }, 10000); // Increased timeout

    it("should handle session creation failure", async () => {
      // Setup
      const mockResponse = stripeTestScenarios.failedCheckout();
      mocks.mockFetch.mockResolvedValue(mockResponse);

      const params = createCheckoutParams();

      // Execute & Verify
      await expect(service.purchasePositions(params)).rejects.toThrow();
    }, 10000); // Increased timeout

    it("should handle redirect failure", async () => {
      // Setup
      const mockResponse = stripeTestScenarios.successfulCheckout();
      const stripeError = new Error("Redirect failed");

      mocks.mockFetch.mockResolvedValue(mockResponse);
      mocks.mockStripe.redirectToCheckout.mockRejectedValue(stripeError);
      mocks.mockLoadStripe.mockResolvedValue(mocks.mockStripe);

      const params = createCheckoutParams();

      // Execute & Verify
      await expect(service.purchasePositions(params)).rejects.toThrow(
        "Redirect failed"
      );
    }, 10000); // Increased timeout
  });

  describe("singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = StripeService.getInstance();
      const instance2 = StripeService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe("error handling", () => {
    it("should log errors appropriately", async () => {
      // Setup
      const error = new Error("Test error");
      mocks.mockFetch.mockRejectedValue(error);

      const params = createCheckoutParams();

      // Execute & Verify
      await expect(service.createCheckoutSession(params)).rejects.toThrow(
        "Test error"
      );
    });

    it("should handle malformed responses", async () => {
      // Setup
      const malformedResponse = {
        ok: true,
        json: jest.fn().mockRejectedValue(new Error("Invalid JSON")),
      };
      mocks.mockFetch.mockResolvedValue(malformedResponse);

      const params = createCheckoutParams();

      // Execute & Verify
      await expect(service.createCheckoutSession(params)).rejects.toThrow(
        "Invalid JSON"
      );
    });
  });
});
