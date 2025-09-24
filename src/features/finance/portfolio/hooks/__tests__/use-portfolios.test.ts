import { act, renderHook, waitFor } from "@testing-library/react";
import { usePortfolios } from "../use-portfolios";

// Mock the logger
jest.mock("@/lib/utils/logger", () => ({
  log: {
    success: jest.fn(),
    failure: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe("usePortfolios", () => {
  const mockUserId = "test-user-123";
  const mockPortfolio = {
    id: "portfolio-1",
    name: "Test Portfolio",
    description: "A test portfolio",
    thesis: "Test thesis",
    positions: [],
    assignedAgents: [],
    isActive: false,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should initialize with empty portfolios and loading state", () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ portfolios: [] }),
    });

    const { result } = renderHook(() => usePortfolios(mockUserId));

    expect(result.current.portfolios).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(null);
  });

  it("should load portfolios on mount", async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ portfolios: [mockPortfolio] }),
    });

    const { result } = renderHook(() => usePortfolios(mockUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.portfolios).toEqual([mockPortfolio]);
    expect(fetch).toHaveBeenCalledWith(`/api/portfolios?userId=${mockUserId}`);
  });

  it("should handle fetch error gracefully", async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => usePortfolios(mockUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.portfolios).toEqual([]);
  });

  it("should add portfolio to local state without duplicates", async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ portfolios: [] }),
    });

    const { result } = renderHook(() => usePortfolios(mockUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Add portfolio
    act(() => {
      result.current.addPortfolio(mockPortfolio);
    });

    expect(result.current.portfolios).toEqual([mockPortfolio]);

    // Try to add the same portfolio again
    act(() => {
      result.current.addPortfolio(mockPortfolio);
    });

    // Should still only have one portfolio (no duplicates)
    expect(result.current.portfolios).toEqual([mockPortfolio]);
  });

  it("should create portfolio successfully", async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ portfolios: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ portfolio: mockPortfolio }),
      });

    const { result } = renderHook(() => usePortfolios(mockUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const createRequest = {
      name: "Test Portfolio",
      description: "A test portfolio",
      thesis: "Test thesis",
      assignedAgentIds: [],
      positions: [],
      isActive: false,
      metadata: {},
    };

    let createdPortfolio: any;
    await act(async () => {
      createdPortfolio = await result.current.createPortfolio(createRequest);
    });

    expect(createdPortfolio).toEqual(mockPortfolio);
    expect(result.current.portfolios).toEqual([mockPortfolio]);
    expect(fetch).toHaveBeenCalledWith("/api/portfolios", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createRequest),
    });
  });

  it("should handle create portfolio error", async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ portfolios: [] }),
      })
      .mockRejectedValueOnce(new Error("Create failed"));

    const { result } = renderHook(() => usePortfolios(mockUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const createRequest = {
      name: "Test Portfolio",
      description: "A test portfolio",
      thesis: "Test thesis",
      assignedAgentIds: [],
      positions: [],
      isActive: false,
      metadata: {},
    };

    await act(async () => {
      try {
        await result.current.createPortfolio(createRequest);
      } catch (error) {
        // Expected to throw
      }
    });

    expect(result.current.error).toBe("Create failed");
  });
});
