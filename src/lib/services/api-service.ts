import { log } from "@/lib/utils/logger";

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  success: boolean;
}

export class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  async post<T = any>(endpoint: string, data: any): Promise<T> {
    try {
      log.info(`API POST request to ${endpoint}`, { data }, "ApiService");
      
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      log.success(`API POST success for ${endpoint}`, { result }, "ApiService");
      return result;
    } catch (error) {
      log.error(`API POST failed for ${endpoint}`, error, "ApiService");
      throw error;
    }
  }

  async get<T = any>(endpoint: string): Promise<T> {
    try {
      log.info(`API GET request to ${endpoint}`, {}, "ApiService");
      
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      log.success(`API GET success for ${endpoint}`, { result }, "ApiService");
      return result;
    } catch (error) {
      log.error(`API GET failed for ${endpoint}`, error, "ApiService");
      throw error;
    }
  }
}

// Create a default instance for the app
export const apiService = new ApiService();
