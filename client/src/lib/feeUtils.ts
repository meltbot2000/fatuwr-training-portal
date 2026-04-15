export type FeeSession = {
  memberFee: number;
  memberSwimFee: number;
  nonMemberFee: number;
  nonMemberSwimFee: number;
  studentFee: number;
  studentSwimFee: number;
};

export function getMembershipOnTrainingDate(
  currentStatus: string,
  trialEndDate: string,   // "DD/MM/YYYY" or "" or "NA"
  trainingDateStr: string // the session's training date string
): string {
  if (currentStatus === "Member" || currentStatus === "Student") return currentStatus;
  if (currentStatus === "Trial") {
    if (!trialEndDate || trialEndDate === "NA") return "Non-Member";
    const [d, m, y] = trialEndDate.split("/").map(Number);
    const trialEnd = new Date(y, m - 1, d);
    const trainingDate = new Date(trainingDateStr);
    if (isNaN(trainingDate.getTime())) return "Non-Member";
    return trialEnd >= trainingDate ? "Trial" : "Non-Member";
  }
  return "Non-Member";
}

export function calculateFee(
  session: FeeSession,
  membershipOnDate: string,
  activity: string
): number {
  // Trainer and First-timer are always free
  const actLower = activity.toLowerCase();
  if (actLower === "trainer" || actLower === "first timer" || actLower === "first-timer") return 0;

  const isSwim = actLower.includes("swim");
  const status = membershipOnDate.toLowerCase();
  if (status === "member" || status === "trial") {
    return isSwim ? session.memberSwimFee : session.memberFee;
  }
  if (status === "student") {
    return isSwim ? (session.studentSwimFee ?? session.memberSwimFee) : session.studentFee;
  }
  // Non-member
  return isSwim ? session.nonMemberSwimFee : session.nonMemberFee;
}
