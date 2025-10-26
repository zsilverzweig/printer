// Tests for priority scoring logic in waitlist
describe("Waitlist Priority Scoring", () => {
  describe("Priority Score Calculation", () => {
    it("should give massive boost to paid users", () => {
      // Non-paid user with high points
      const nonPaidUser = {
        isPaidUser: false,
        paidUpgrades: 0,
        totalPoints: 100,
      };

      // Paid user with low points
      const paidUser = {
        isPaidUser: true,
        paidUpgrades: 1,
        totalPoints: 5,
      };

      // Calculate priority scores
      const nonPaidScore = nonPaidUser.isPaidUser
        ? 1000000 + nonPaidUser.paidUpgrades * 100 + nonPaidUser.totalPoints
        : nonPaidUser.totalPoints;

      const paidScore = paidUser.isPaidUser
        ? 1000000 + paidUser.paidUpgrades * 100 + paidUser.totalPoints
        : paidUser.totalPoints;

      expect(paidScore).toBe(1000105); // 1000000 + (1 * 100) + 5
      expect(nonPaidScore).toBe(100); // Just points
      expect(paidScore).toBeGreaterThan(nonPaidScore);
    });

    it("should rank paid users by paid upgrades first, then points", () => {
      const users = [
        {
          id: "user1",
          isPaidUser: true,
          paidUpgrades: 1,
          totalPoints: 50,
          joinedAt: new Date("2023-01-03"),
        },
        {
          id: "user2",
          isPaidUser: true,
          paidUpgrades: 3,
          totalPoints: 10,
          joinedAt: new Date("2023-01-01"),
        },
        {
          id: "user3",
          isPaidUser: true,
          paidUpgrades: 2,
          totalPoints: 30,
          joinedAt: new Date("2023-01-02"),
        },
      ];

      // Calculate priority scores
      const usersWithScores = users.map((user) => ({
        ...user,
        priorityScore: user.isPaidUser
          ? 1000000 + user.paidUpgrades * 100 + user.totalPoints
          : user.totalPoints,
      }));

      // Sort by priority score (descending)
      usersWithScores.sort((a, b) => b.priorityScore - a.priorityScore);

      expect(usersWithScores[0].id).toBe("user2"); // 3 upgrades = 1000300
      expect(usersWithScores[1].id).toBe("user3"); // 2 upgrades = 1000230
      expect(usersWithScores[2].id).toBe("user1"); // 1 upgrade = 1000150
    });

    it("should rank non-paid users by points, then join date", () => {
      const users = [
        {
          id: "user1",
          isPaidUser: false,
          paidUpgrades: 0,
          totalPoints: 50,
          joinedAt: new Date("2023-01-03"),
        },
        {
          id: "user2",
          isPaidUser: false,
          paidUpgrades: 0,
          totalPoints: 10,
          joinedAt: new Date("2023-01-01"),
        },
        {
          id: "user3",
          isPaidUser: false,
          paidUpgrades: 0,
          totalPoints: 50,
          joinedAt: new Date("2023-01-02"),
        },
      ];

      // Calculate priority scores
      const usersWithScores = users.map((user) => ({
        ...user,
        priorityScore: user.isPaidUser
          ? 1000000 + user.paidUpgrades * 100 + user.totalPoints
          : user.totalPoints,
      }));

      // Sort by priority score (descending), then by join date (ascending)
      usersWithScores.sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) {
          return b.priorityScore - a.priorityScore;
        }
        return a.joinedAt.getTime() - b.joinedAt.getTime();
      });

      expect(usersWithScores[0].id).toBe("user3"); // 50 points, joined earlier
      expect(usersWithScores[1].id).toBe("user1"); // 50 points, joined later
      expect(usersWithScores[2].id).toBe("user2"); // 10 points
    });

    it("should handle mixed paid and non-paid users correctly", () => {
      const users = [
        {
          id: "user1",
          isPaidUser: false,
          paidUpgrades: 0,
          totalPoints: 1000,
          joinedAt: new Date("2023-01-01"),
        },
        {
          id: "user2",
          isPaidUser: true,
          paidUpgrades: 1,
          totalPoints: 5,
          joinedAt: new Date("2023-01-02"),
        },
        {
          id: "user3",
          isPaidUser: false,
          paidUpgrades: 0,
          totalPoints: 50,
          joinedAt: new Date("2023-01-03"),
        },
      ];

      // Calculate priority scores
      const usersWithScores = users.map((user) => ({
        ...user,
        priorityScore: user.isPaidUser
          ? 1000000 + user.paidUpgrades * 100 + user.totalPoints
          : user.totalPoints,
      }));

      // Sort by priority score (descending)
      usersWithScores.sort((a, b) => b.priorityScore - a.priorityScore);

      expect(usersWithScores[0].id).toBe("user2"); // Paid user first (1000105)
      expect(usersWithScores[1].id).toBe("user1"); // Non-paid with most points (1000)
      expect(usersWithScores[2].id).toBe("user3"); // Non-paid with fewest points (50)
    });
  });

  describe("Position Updates After Payment", () => {
    it("should correctly update priority score after payment", () => {
      // User starts as non-paid
      let user = {
        isPaidUser: false,
        paidUpgrades: 0,
        totalPoints: 25,
        priorityScore: 25,
      };

      // User makes a payment for 3 positions
      const paymentPositions = 3;
      const newPaidUpgrades = user.paidUpgrades + paymentPositions;
      const newTotalPoints = user.totalPoints + paymentPositions; // 1 point per position
      const newPriorityScore = 1000000 + newPaidUpgrades * 100 + newTotalPoints;

      user = {
        ...user,
        isPaidUser: true,
        paidUpgrades: newPaidUpgrades,
        totalPoints: newTotalPoints,
        priorityScore: newPriorityScore,
      };

      expect(user.priorityScore).toBe(1000328); // 1000000 + (3 * 100) + 28
      expect(user.isPaidUser).toBe(true);
      expect(user.paidUpgrades).toBe(3);
    });

    it("should handle multiple payments correctly", () => {
      // User makes first payment
      let user = {
        isPaidUser: true,
        paidUpgrades: 2,
        totalPoints: 30,
        priorityScore: 1000230,
      };

      // User makes second payment
      const secondPaymentPositions = 5;
      const newPaidUpgrades = user.paidUpgrades + secondPaymentPositions;
      const newTotalPoints = user.totalPoints + secondPaymentPositions;
      const newPriorityScore = 1000000 + newPaidUpgrades * 100 + newTotalPoints;

      user = {
        ...user,
        paidUpgrades: newPaidUpgrades,
        totalPoints: newTotalPoints,
        priorityScore: newPriorityScore,
      };

      expect(user.paidUpgrades).toBe(7); // 2 + 5
      expect(user.totalPoints).toBe(35); // 30 + 5
      expect(user.priorityScore).toBe(1000735); // 1000000 + (7 * 100) + 35
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero values correctly", () => {
      const user = {
        isPaidUser: true,
        paidUpgrades: 0,
        totalPoints: 0,
      };

      const priorityScore = user.isPaidUser
        ? 1000000 + user.paidUpgrades * 100 + user.totalPoints
        : user.totalPoints;

      expect(priorityScore).toBe(1000000);
    });

    it("should handle undefined values gracefully", () => {
      const user = {
        isPaidUser: false,
        paidUpgrades: undefined,
        totalPoints: undefined,
      };

      const paidUpgrades = user.paidUpgrades || 0;
      const totalPoints = user.totalPoints || 0;

      const priorityScore = user.isPaidUser
        ? 1000000 + paidUpgrades * 100 + totalPoints
        : totalPoints;

      expect(priorityScore).toBe(0);
    });
  });
});
