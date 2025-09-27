import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { db, COLLECTIONS } from "@/lib/services/firebase";
import { log } from "@/lib/utils/logger";

import { CompanyResearch, CompanyResearchRepository } from "../types";
import { 
  serializeCompanyResearch, 
  deserializeCompanyResearch 
} from "@/features/ai/agents/services/firestore/converters";

export class FirestoreCompanyResearchRepository implements CompanyResearchRepository {
  async createResearch(research: CompanyResearch): Promise<CompanyResearch> {
    try {
      const ref = doc(db, COLLECTIONS.COMPANY_RESEARCH, research.id);
      await setDoc(ref, serializeCompanyResearch(research));
      
      log.success(
        `Company research created: ${research.companyTicker}`,
        { researchId: research.id, userId: research.userId },
        "FirestoreCompanyResearchRepository"
      );
      
      return research;
    } catch (error) {
      log.error("Failed to create company research", error, "FirestoreCompanyResearchRepository");
      throw error;
    }
  }

  async getResearch(id: string): Promise<CompanyResearch | null> {
    try {
      const snapshot = await getDoc(doc(db, COLLECTIONS.COMPANY_RESEARCH, id));
      
      if (!snapshot.exists()) {
        return null;
      }
      
      return deserializeCompanyResearch(snapshot.id, snapshot.data());
    } catch (error) {
      log.error("Failed to get company research", error, "FirestoreCompanyResearchRepository");
      throw error;
    }
  }

  async getAllResearch(userId: string): Promise<CompanyResearch[]> {
    try {
      const q = query(
        collection(db, COLLECTIONS.COMPANY_RESEARCH),
        where("userId", "==", userId)
      );
      
      const snapshot = await getDocs(q);
      
      // Sort by createdAt in memory (client-side sorting)
      const research = snapshot.docs.map((doc) => 
        deserializeCompanyResearch(doc.id, doc.data())
      );
      
      return research.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      log.error("Failed to get all company research", error, "FirestoreCompanyResearchRepository");
      throw error;
    }
  }

  async updateResearch(id: string, updates: Partial<CompanyResearch>): Promise<CompanyResearch> {
    try {
      const ref = doc(db, COLLECTIONS.COMPANY_RESEARCH, id);
      
      // Convert updates to Firestore format
      const firestoreUpdates: any = {
        ...updates,
        updatedAt: new Date(),
      };
      
      // Handle date fields
      if (updates.completedAt) {
        firestoreUpdates.completedAt = updates.completedAt;
      }
      
      await updateDoc(ref, firestoreUpdates);
      
      // Get the updated document
      const updatedResearch = await this.getResearch(id);
      if (!updatedResearch) {
        throw new Error(`Research with id ${id} not found after update`);
      }
      
      log.success(
        `Company research updated: ${updatedResearch.companyTicker}`,
        { researchId: id },
        "FirestoreCompanyResearchRepository"
      );
      
      return updatedResearch;
    } catch (error) {
      log.error("Failed to update company research", error, "FirestoreCompanyResearchRepository");
      throw error;
    }
  }

  async deleteResearch(id: string): Promise<void> {
    try {
      const ref = doc(db, COLLECTIONS.COMPANY_RESEARCH, id);
      await deleteDoc(ref);
      
      log.success(
        `Company research deleted`,
        { researchId: id },
        "FirestoreCompanyResearchRepository"
      );
    } catch (error) {
      log.error("Failed to delete company research", error, "FirestoreCompanyResearchRepository");
      throw error;
    }
  }

  async searchResearch(queryText: string, userId: string): Promise<CompanyResearch[]> {
    try {
      // Simple query by userId only, then filter in memory
      const q = query(
        collection(db, COLLECTIONS.COMPANY_RESEARCH),
        where("userId", "==", userId)
      );
      
      const snapshot = await getDocs(q);
      
      // Filter results based on search query in memory
      const allResearch = snapshot.docs.map((doc) => 
        deserializeCompanyResearch(doc.id, doc.data())
      );
      
      const searchLower = queryText.toLowerCase();
      const filtered = allResearch.filter((research) =>
        research.companyTicker.toLowerCase().includes(searchLower) ||
        research.companyName?.toLowerCase().includes(searchLower) ||
        research.agentName.toLowerCase().includes(searchLower) ||
        research.researchReport.toLowerCase().includes(searchLower) ||
        research.executiveSummary?.toLowerCase().includes(searchLower)
      );
      
      // Sort by createdAt (newest first)
      return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      log.error("Failed to search company research", error, "FirestoreCompanyResearchRepository");
      throw error;
    }
  }
}
