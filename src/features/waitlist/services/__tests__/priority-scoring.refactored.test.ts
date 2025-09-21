// Refactored tests for priority scoring logic using new test infrastructure
import {
  calculatePriorityScore,
  createSortedWaitlist,
  waitlistTestData,
} from "@/lib/test-utils";

describe("Waitlist Priority Scoring", () => {
  describe("Priority Score Calculation", () => {
    it("should give massive boost to paid users", () => {
      // Non-paid user with high points
      const nonPaidUser = waitlistTestData.highPointsUser();
      const paidUser = waitlistTestData.paidUser();

      // Calculate priority scores
      const nonPaidScore = calculatePriorityScore(
        nonPaidUser.isPaidUser,
        nonPaidUser.paidUpgrades,
        nonPaidUser.totalPoints
      );

      const paidScore = calculatePriorityScore(
        paidUser.isPaidUser,
        paidUser.paidUpgrades,
        paidUser.totalPoints
      );

      expect(paidScore).toBe(1000205); // 1000000 + (2 * 100) + 5
      expect(nonPaidScore).toBe(50); // Just points
      expect(paidScore).toBeGreaterThan(nonPaidScore);
    });

    it("should rank paid users by paid upgrades first, then points", () => {
      const users = [
        {
          isPaidUser: true,
          paidUpgrades: 1,
          totalPoints: 50,
          joinedAt: new Date("2023-01-03"),
        },
        {
          isPaidUser: true,
          paidUpgrades: 3,
          totalPoints: 10,
          joinedAt: new Date("2023-01-01"),
        },
        {
          isPaidUser: true,
          paidUpgrades: 2,
          totalPoints: 30,
          joinedAt: new Date("2023-01-02"),
        },
      ];

      // Calculate priority scores
      const usersWithScores = users.map((user) => ({
        ...user,
        priorityScore: calculatePriorityScore(
          user.isPaidUser,
          user.paidUpgrades,
          user.totalPoints
        ),
      }));

      // Sort by priority score (descending)
      usersWithScores.sort((a, b) => b.priorityScore - a.priorityScore);

      expect(usersWithScores[0].paidUpgrades).toBe(3); // Highest upgrades
      expect(usersWithScores[1].paidUpgrades).toBe(2); // Second highest
      expect(usersWithScores[2].paidUpgrades).toBe(1); // Lowest upgrades
    });

    it("should rank non-paid users by points, then join date", () => {
      const users = [
        {
          isPaidUser: false,
          paidUpgrades: 0,
          totalPoints: 50,
          joinedAt: new Date("2023-01-03"),
        },
        {
          isPaidUser: false,
          paidUpgrades: 0,
          totalPoints: 10,
          joinedAt: new Date("2023-01-01"),
        },
        {
          isPaidUser: false,
          paidUpgrades: 0,
          totalPoints: 50,
          joinedAt: new Date("2023-01-02"),
        },
      ];

      // Calculate priority scores
      const usersWithScores = users.map((user) => ({
        ...user,
        priorityScore: calculatePriorityScore(
          user.isPaidUser,
          user.paidUpgrades,
          user.totalPoints
        ),
      }));

      // Sort by priority score (descending), then by join date (ascending)
      usersWithScores.sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) {
          return b.priorityScore - a.priorityScore;
        }
        return a.joinedAt.getTime() - b.joinedAt.getTime();
      });

      // Both users with 50 points should be ranked by join date
      expect(usersWithScores[0].totalPoints).toBe(50);
      expect(usersWithScores[0].joinedAt.getTime()).toBe(
        new Date("2023-01-02").getTime()
      );
      expect(usersWithScores[1].totalPoints).toBe(50);
      expect(usersWithScores[1].joinedAt.getTime()).toBe(
        new Date("2023-01-03").getTime()
      );
      expect(usersWithScores[2].totalPoints).toBe(10);
    });

    it("should handle mixed paid and non-paid users correctly", () => {
      const users = [
        waitlistTestData.highPointsUser(), // 50 points, non-paid
        waitlistTestData.paidUser(), // 1000205 priority score
        waitlistTestData.activeUser(), // 10 points, non-paid
      ];

      // Use the sorted waitlist helper
      const sortedUsers = createSortedWaitlist(users);

      expect(sortedUsers[0].isPaidUser).toBe(true); // Paid user first
      expect(sortedUsers[1].totalPoints).toBe(50); // Non-paid with most points
      expect(sortedUsers[2].totalPoints).toBe(10); // Non-paid with fewest points
    });
  });

  describe("Position Updates After Payment", () => {
    it("should correctly update priority score after payment", () => {
      // User starts as non-paid
      let user = waitlistTestData.activeUser();

      // User makes a payment for 3 positions
      const paymentPositions = 3;
      const newPaidUpgrades = user.paidUpgrades + paymentPositions;
      const newPriorityScore = calculatePriorityScore(
        true,
        newPaidUpgrades,
        user.totalPoints + paymentPositions
      );

      user = {
        ...user,
        isPaidUser: true,
        paidUpgrades: newPaidUpgrades,
        totalPoints: user.totalPoints + paymentPositions, // 1 point per position
        priorityScore: newPriorityScore,
      };

      expect(user.priorityScore).toBe(1000313); // 1000000 + (3 * 100) + 13
      expect(user.isPaidUser).toBe(true);
      expect(user.paidUpgrades).toBe(3);
    });

    it("should handle multiple payments correctly", () => {
      // User makes first payment
      let user = waitlistTestData.paidUser();

      // User makes second payment
      const secondPaymentPositions = 5;
      const newPaidUpgrades = user.paidUpgrades + secondPaymentPositions;
      const newTotalPoints = user.totalPoints + secondPaymentPositions;
      const newPriorityScore = calculatePriorityScore(
        true,
        newPaidUpgrades,
        newTotalPoints
      );

      user = {
        ...user,
        paidUpgrades: newPaidUpgrades,
        totalPoints: newTotalPoints,
        priorityScore: newPriorityScore,
      };

      expect(user.paidUpgrades).toBe(7); // 2 + 5
      expect(user.totalPoints).toBe(10); // 5 + 5
      expect(user.priorityScore).toBe(1000710); // 1000000 + (7 * 100) + 10
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero values correctly", () => {
      const priorityScore = calculatePriorityScore(true, 0, 0);
      expect(priorityScore).toBe(1000000);
    });

    it("should handle undefined values gracefully", () => {
      const priorityScore = calculatePriorityScore(
        false,
        undefined as any,
        undefined as any
      );
      expect(priorityScore).toBe(0);
    });

    it("should maintain consistent scoring across multiple calculations", () => {
      const user = waitlistTestData.paidUser();

      const score1 = calculatePriorityScore(
        user.isPaidUser,
        user.paidUpgrades,
        user.totalPoints
      );
      const score2 = calculatePriorityScore(
        user.isPaidUser,
        user.paidUpgrades,
        user.totalPoints
      );

      expect(score1).toBe(score2);
      expect(score1).toBe(1000205);
    });
  });

  describe("Real-world Scenarios", () => {
    it("should handle a large waitlist with mixed user types", () => {
      const largeWaitlist = [
        waitlistTestData.newUser(),
        waitlistTestData.activeUser(),
        waitlistTestData.highPointsUser(),
        waitlistTestData.paidUser(),
        {
          id: "user-5",
          userId: "user-5",
          email: "user5@example.com",
          position: 5,
          totalActions: 3,
          totalPoints: 15,
          paidUpgrades: 5,
          isPaidUser: true,
          priorityScore: 1000515,
          status: "active" as const,
          joinedAt: new Date("2023-01-05"),
          createdAt: new Date("2023-01-05"),
          updatedAt: new Date("2023-01-05"),
          metadata: {},
        },
        {
          id: "user-6",
          userId: "user-6",
          email: "user6@example.com",
          position: 6,
          totalActions: 2,
          totalPoints: 25,
          paidUpgrades: 0,
          isPaidUser: false,
          priorityScore: 25,
          status: "active" as const,
          joinedAt: new Date("2023-01-04"),
          createdAt: new Date("2023-01-04"),
          updatedAt: new Date("2023-01-04"),
          metadata: {},
        },
      ];

      const sortedWaitlist = createSortedWaitlist(largeWaitlist);

      // Verify paid users are at the top
      expect(sortedWaitlist[0].isPaidUser).toBe(true);
      expect(sortedWaitlist[0].paidUpgrades).toBe(5); // Highest paid upgrades first
      expect(sortedWaitlist[1].isPaidUser).toBe(true);
      expect(sortedWaitlist[1].paidUpgrades).toBe(2);

      // Verify non-paid users are ranked by points
      const nonPaidUsers = sortedWaitlist.filter((user) => !user.isPaidUser);
      expect(nonPaidUsers[0].totalPoints).toBe(50); // Highest points first
      expect(nonPaidUsers[1].totalPoints).toBe(25);
      expect(nonPaidUsers[2].totalPoints).toBe(10);
      expect(nonPaidUsers[3].totalPoints).toBe(0);
    });

    it("should handle users with identical scores correctly", () => {
      const identicalUsers = [
        {
          isPaidUser: false,
          paidUpgrades: 0,
          totalPoints: 10,
          joinedAt: new Date("2023-01-02"),
        },
        {
          isPaidUser: false,
          paidUpgrades: 0,
          totalPoints: 10,
          joinedAt: new Date("2023-01-01"),
        },
        {
          isPaidUser: false,
          paidUpgrades: 0,
          totalPoints: 10,
          joinedAt: new Date("2023-01-03"),
        },
      ];

      const sortedUsers = createSortedWaitlist(identicalUsers);

      // Should be sorted by join date (earliest first)
      expect(sortedUsers[0].joinedAt.getTime()).toBe(
        new Date("2023-01-01").getTime()
      );
      expect(sortedUsers[1].joinedAt.getTime()).toBe(
        new Date("2023-01-02").getTime()
      );
      expect(sortedUsers[2].joinedAt.getTime()).toBe(
        new Date("2023-01-03").getTime()
      );
    });
  });
});
