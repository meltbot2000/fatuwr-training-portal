import { double, index, int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  image: mediumtext("image"),  // base64 data URL for profile photo — mediumtext supports up to ~16MB
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("idx_users_email").on(table.email),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const otpCodes = mysqlTable("otp_codes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt", { fsp: 0 }).notNull(),
  used: int("used").default(0).notNull(),
  createdAt: timestamp("createdAt", { fsp: 0 }).defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("idx_otp_codes_email").on(table.email),
}));

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
}, (table) => ({
  rowIdIdx: index("idx_sheet_sessions_row_id").on(table.rowId),
}));
export type SheetSession = typeof sheetSessions.$inferSelect;

export const sheetPayments = mysqlTable("sheet_payments", {
  id: int("id").primaryKey().autoincrement(),
  paymentId: varchar("paymentId", { length: 128 }).default(""),
  reference: text("reference"),
  amount: double("amount").notNull(),
  date: varchar("date", { length: 64 }).default(""),
  email: varchar("email", { length: 320 }).default(""),
  syncedAt: timestamp("syncedAt").defaultNow(),
}, (table) => ({
  paymentIdIdx: index("idx_sheet_payments_payment_id").on(table.paymentId),
  emailIdx:     index("idx_sheet_payments_email").on(table.email),
}));
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
}, (table) => ({
  // Composite index for session attendee lookups (getSignUpsForSession)
  poolDateIdx:  index("idx_sheet_signups_pool_date").on(table.pool, table.dateOfTraining),
  // Individual indexes for user history and payment matching
  emailIdx:     index("idx_sheet_signups_email").on(table.email),
  paymentIdIdx: index("idx_sheet_signups_payment_id").on(table.paymentId),
}));
export type SheetSignup = typeof sheetSignups.$inferSelect;

export const sheetUsers = mysqlTable("sheet_users", {
  id: int("id").primaryKey().autoincrement(),
  sheetId: varchar("sheetId", { length: 64 }).default(""),
  name: varchar("name", { length: 256 }).default(""),
  userEmail: varchar("userEmail", { length: 320 }).default(""),
  email: varchar("email", { length: 320 }).notNull(),
  image: mediumtext("image"),
  paymentId: varchar("paymentId", { length: 128 }).default(""),
  memberStatus: varchar("memberStatus", { length: 64 }).default("Non-Member"),
  clubRole: varchar("clubRole", { length: 64 }).default(""),
  membershipStartDate: varchar("membershipStartDate", { length: 64 }).default(""),
  trialStartDate: varchar("trialStartDate", { length: 64 }).default(""),
  trialEndDate: varchar("trialEndDate", { length: 64 }).default(""),
  dob: varchar("dob", { length: 64 }).default(""),
  syncedAt: timestamp("syncedAt").defaultNow().onUpdateNow(),
}, (table) => ({
  // Both email columns are queried on every login, profile fetch, and membership update
  emailIdx:     index("idx_sheet_users_email").on(table.email),
  userEmailIdx: index("idx_sheet_users_user_email").on(table.userEmail),
  paymentIdIdx: index("idx_sheet_users_payment_id").on(table.paymentId),
}));
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

export const merchItems = mysqlTable("merch_items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  memberPrice: varchar("memberPrice", { length: 255 }).default(""),
  nonMemberPrice: varchar("nonMemberPrice", { length: 255 }).default(""),
  photo1: mediumtext("photo1"),
  photo2: mediumtext("photo2"),
  availableSizes: varchar("availableSizes", { length: 512 }).default(""),
  howToPurchase: text("howToPurchase"),
  inventory: text("inventory"),
  sortOrder: double("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MerchItem = typeof merchItems.$inferSelect;

export const videos = mysqlTable("videos", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  url: text("url").notNull(),
  notes: text("notes"),
  postedBy: varchar("postedBy", { length: 255 }).notNull(),
  postedDate: varchar("postedDate", { length: 32 }).notNull(), // YYYY-MM-DD
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Video = typeof videos.$inferSelect;
export type InsertVideo = typeof videos.$inferInsert;
