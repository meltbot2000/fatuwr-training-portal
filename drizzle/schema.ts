import { double, int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  memberStatus: varchar("memberStatus", { length: 32 }).default("Non-Member"),
  paymentId: varchar("paymentId", { length: 64 }),
  clubRole: varchar("clubRole", { length: 32 }).default(""),
  trialStartDate: varchar("trialStartDate", { length: 32 }).default(""),
  trialEndDate: varchar("trialEndDate", { length: 32 }).default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const otpCodes = mysqlTable("otp_codes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt", { fsp: 0 }).notNull(),
  used: int("used").default(0).notNull(),
  createdAt: timestamp("createdAt", { fsp: 0 }).defaultNow().notNull(),
});

export type OtpCode = typeof otpCodes.$inferSelect;
export type InsertOtpCode = typeof otpCodes.$inferInsert;

// ─── Sheets cache tables ──────────────────────────────────────────────────────
// These mirror the four Google Sheets tabs and are kept in sync by server/sync.ts.
// Reads go to DB first (< 5 ms); Sheets API is only hit on cold start / fallback.

export const sheetSessions = mysqlTable("sheet_sessions", {
  rowIndex: int("rowIndex").primaryKey(),
  trainingDate: varchar("trainingDate", { length: 64 }).notNull(),
  day: varchar("day", { length: 256 }).default(""),
  trainingTime: varchar("trainingTime", { length: 64 }).default(""),
  pool: varchar("pool", { length: 128 }).default(""),
  poolImageUrl: text("poolImageUrl"),
  memberFee: double("memberFee").default(0),
  nonMemberFee: double("nonMemberFee").default(0),
  memberSwimFee: double("memberSwimFee").default(0),
  nonMemberSwimFee: double("nonMemberSwimFee").default(0),
  studentFee: double("studentFee").default(0),
  studentSwimFee: double("studentSwimFee").default(0),
  trainerFee: double("trainerFee").default(0),
  notes: text("notes"),
  rowId: varchar("rowId", { length: 64 }).default(""),
  attendance: int("attendance").default(0),
  isClosed: varchar("isClosed", { length: 64 }).default(""),
  trainingObjective: text("trainingObjective"),
  signUpCloseTime: varchar("signUpCloseTime", { length: 64 }).default(""),
  venueCost: double("venueCost").default(0),
  revenue: double("revenue").default(0),
  rainOff: varchar("rainOff", { length: 16 }).default(""),
  syncedAt: timestamp("syncedAt").defaultNow().onUpdateNow(),
});
export type SheetSession = typeof sheetSessions.$inferSelect;

export const sheetPayments = mysqlTable("sheet_payments", {
  id: int("id").primaryKey().autoincrement(),
  paymentId: varchar("paymentId", { length: 128 }).default(""),
  reference: text("reference"),
  amount: double("amount").notNull(),
  date: varchar("date", { length: 64 }).default(""),
  email: varchar("email", { length: 320 }).default(""),
  syncedAt: timestamp("syncedAt").defaultNow(),
});
export type SheetPayment = typeof sheetPayments.$inferSelect;

export const sheetSignups = mysqlTable("sheet_signups", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 256 }).default(""),
  email: varchar("email", { length: 320 }).default(""),
  paymentId: varchar("paymentId", { length: 128 }).default(""),
  dateTimeOfSignUp: varchar("dateTimeOfSignUp", { length: 64 }).default(""),
  pool: varchar("pool", { length: 128 }).default(""),
  dateOfTraining: varchar("dateOfTraining", { length: 64 }).default(""),
  activity: varchar("activity", { length: 128 }).default(""),
  activityValue: varchar("activityValue", { length: 128 }).default(""),
  baseFee: double("baseFee").default(0),
  actualFees: double("actualFees").default(0),
  memberOnTrainingDate: varchar("memberOnTrainingDate", { length: 64 }).default(""),
  syncedAt: timestamp("syncedAt").defaultNow(),
});
export type SheetSignup = typeof sheetSignups.$inferSelect;

export const sheetUsers = mysqlTable("sheet_users", {
  id: int("id").primaryKey().autoincrement(),
  sheetId: varchar("sheetId", { length: 64 }).default(""),
  name: varchar("name", { length: 256 }).default(""),
  userEmail: varchar("userEmail", { length: 320 }).default(""),
  email: varchar("email", { length: 320 }).notNull(),
  image: text("image"),
  paymentId: varchar("paymentId", { length: 128 }).default(""),
  memberStatus: varchar("memberStatus", { length: 64 }).default("Non-Member"),
  clubRole: varchar("clubRole", { length: 64 }).default(""),
  membershipStartDate: varchar("membershipStartDate", { length: 64 }).default(""),
  trialStartDate: varchar("trialStartDate", { length: 64 }).default(""),
  trialEndDate: varchar("trialEndDate", { length: 64 }).default(""),
  dob: varchar("dob", { length: 64 }).default(""),
  syncedAt: timestamp("syncedAt").defaultNow().onUpdateNow(),
});
export type SheetUser = typeof sheetUsers.$inferSelect;

export const announcements = mysqlTable("announcements", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }),
  content: text("content"),
  imageUrl: mediumtext("imageUrl"),   // mediumtext supports up to 16 MB for base64-encoded uploads
  position: int("position").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: varchar("createdBy", { length: 255 }),
});
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;
