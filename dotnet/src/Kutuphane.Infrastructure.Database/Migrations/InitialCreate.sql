-- SQLite Database Schema
-- This file is for reference. Entity Framework Core will generate the actual schema.

-- Books Table
CREATE TABLE IF NOT EXISTS "Books" (
    "Id" TEXT NOT NULL PRIMARY KEY,
    "Title" TEXT NOT NULL,
    "Author" TEXT NOT NULL,
    "Category" TEXT NOT NULL,
    "Quantity" INTEGER NOT NULL,
    "TotalQuantity" INTEGER NOT NULL,
    "Lastpersonel" TEXT
);

CREATE INDEX IF NOT EXISTS "IX_Books_Title" ON "Books" ("Title");
CREATE INDEX IF NOT EXISTS "IX_Books_Author" ON "Books" ("Author");
CREATE INDEX IF NOT EXISTS "IX_Books_Category" ON "Books" ("Category");

-- Loans Table
CREATE TABLE IF NOT EXISTS "Loans" (
    "Id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "BookId" TEXT NOT NULL,
    "Borrower" TEXT NOT NULL,
    "DueDate" TEXT NOT NULL,
    "personel" TEXT NOT NULL,
    FOREIGN KEY ("BookId") REFERENCES "Books" ("Id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IX_Loans_BookId" ON "Loans" ("BookId");
CREATE INDEX IF NOT EXISTS "IX_Loans_Borrower" ON "Loans" ("Borrower");
CREATE INDEX IF NOT EXISTS "IX_Loans_DueDate" ON "Loans" ("DueDate");

-- Users Table (includes Students, personel, and Admin)
CREATE TABLE IF NOT EXISTS "Users" (
    "Id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "Username" TEXT,
    "Password" TEXT,
    "Role" TEXT NOT NULL,
    "Name" TEXT NOT NULL,
    "Surname" TEXT NOT NULL,
    "Class" INTEGER,
    "Branch" TEXT,
    "StudentNumber" INTEGER,
    "PenaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "Position" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_Username" ON "Users" ("Username");
CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_StudentNumber" ON "Users" ("StudentNumber");
CREATE INDEX IF NOT EXISTS "IX_Users_Role" ON "Users" ("Role");

-- BookStats Table
CREATE TABLE IF NOT EXISTS "BookStats" (
    "Id" TEXT NOT NULL PRIMARY KEY,
    "Title" TEXT NOT NULL,
    "Author" TEXT NOT NULL,
    "Category" TEXT NOT NULL,
    "Quantity" INTEGER NOT NULL,
    "Borrowed" INTEGER NOT NULL,
    "Returned" INTEGER NOT NULL,
    "Late" INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS "IX_BookStats_Title" ON "BookStats" ("Title");

-- StudentStats Table
CREATE TABLE IF NOT EXISTS "StudentStats" (
    "Id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "Name" TEXT NOT NULL,
    "Surname" TEXT NOT NULL,
    "Borrowed" INTEGER NOT NULL,
    "Returned" INTEGER NOT NULL,
    "Late" INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS "IX_StudentStats_Name_Surname" ON "StudentStats" ("Name", "Surname");



