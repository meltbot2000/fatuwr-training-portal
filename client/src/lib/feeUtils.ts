import { parseAnyDate } from "./dateUtils";

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
  trialEndDate: string,   // any supported date format or "" or "NA"
  trainingDateStr: string // the session's training date string
): string {
  if (currentStatus === "Member" || currentStatus === "Student") return currentStatus;
  if (currentStatus === "Trial") {
    const trialEnd = parseAnyDate(trialEndDate);
    if (!trialEnd) return "Non-Member";
    const trainingDate = parseAnyDate(trainingDateStr);
    if (!trainingDate) return "Non-Member";
    // Trial is valid on the training date if trialEnd >= trainingDate (inclusive)
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
