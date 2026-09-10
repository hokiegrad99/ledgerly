# DATA_MODEL.md

Ledgerly's data model. All entities live in `src/domain/types.ts`. IDs are UUID
strings (`crypto.randomUUID()`). Money is **integer cents** unless noted.
Dates are `YYYY-MM-DD`; months are `YYYY-MM`.

Every entity carries `createdAt` / `updatedAt` timestamps (ISO strings).

---

## Entity Reference

### Account
| Field | Type | Notes |
|---|---|---|
| id | string (PK) | |
| name | string | |
| institution | string | |
| type | `AccountType` | 18 types: checking, savings, cash, credit-card, mortgage, auto/student/personal-loan, brokerage, retirement, 401k, ira, roth-ira, hsa, crypto, real-estate, other-asset, other-liability |
| lastFour | string | account number tail |
| balance | number | **derived**: startingBalance + Σ transaction amounts; recomputed on save/delete/restore |
| startingBalance | number | |
| currency | string | ISO 4217 (default USD; multi-currency ready) |
| notes | string | |
| active | boolean | |
| includeInNetWorth / includeInBudget / includeInReports | boolean | respected by all calculations |

### CategoryGroup
`id`, `name`, `sortOrder`, `archived`, `kind` (`expense` | `income` | `transfer`)

### Category
`id`, `groupId → CategoryGroup`, `name`, `sortOrder`, `archived`

### Tag
`id`, `name`. System tags `__exclude_from_budget` / `__exclude_from_reports`
implement rule exclusions (hidden from UI).

### Transaction
| Field | Notes |
|---|---|
| id | PK |
| accountId | → Account |
| date | YYYY-MM-DD |
| amount | signed cents; negative = money out (expense), positive = money in (income) |
| merchant | user-edited description |
| originalDescription | as imported — preserved |
| categoryId | → Category or null |
| tagIds | string[] → Tag |
| notes | |
| type | `expense` \| `income` \| `transfer` |
| cleared / pending / reviewed | booleans |
| transferId | → TransferPair id when part of a transfer |
| recurringId | → RecurringTransaction when created from one |
| externalId | OFX FITID etc. (used for duplicate detection) |
| splitParentId | set on split-line transactions (see below) |
| importSessionId | → ImportSession |

### TransactionSplit
`id`, `transactionId → Transaction`, `categoryId`, `amount` (signed, same
direction as parent), `merchant`, `notes`, `tagIds`. Split lines are counted by
reporting instead of the parent. The parent transaction remains for editing and
transfer linking.

### TransferPair
`id`, `fromTransactionId` (the negative side), `toTransactionId` (the positive
side), `amount`, `date`. Both transactions get `transferId = pair.id` and
`type = 'transfer'`, excluding them from income/expense.

### TransactionRule
`id`, `name`, `enabled`, `priority` (lower runs first; later rules may
override), `conditions: RuleCondition[]` (all must match), `actions:
RuleAction[]` (all applied).

Condition: `{ field, op, value }` — fields: merchant/description (text ops
contains/not-contains/equals/starts-with/ends-with), amount (gt/lt, dollars),
account/category/type/tag (equality).

Action kinds: `set-category`, `set-merchant`, `add-tag`, `remove-tag`,
`mark-reviewed`, `exclude-from-budget`, `exclude-from-reports`.

### Budget & BudgetItem
- `Budget`: `id`, `month` (YYYY-MM), `mode` (`category` | `flex`),
  `flexAmount` (cents, flex mode).
- `BudgetItem`: `id`, `budgetId → Budget`, `categoryId`, `amount` (cents/month),
  `rollover` (flag; carry-forward math pending — see KNOWN_ISSUES ISSUE-001).

### Goal
`id`, `name`, `type` (savings/emergency-fund/vacation/home-purchase/
major-purchase/debt-payoff/investment/retirement/custom), `targetAmount`,
`currentAmount`, `targetDate`, `monthlyContribution`, `accountIds` (linked
accounts), `notes`, `completed`.

### RecurringTransaction
`id`, `merchant`, `amount`, `categoryId`, `accountId`, `interval` (weekly/
biweekly/monthly/quarterly/semiannual/annual), `dayOfMonth` (1–31, clamped),
`startDate`, `endDate`, `lastOccurrence`, `nextOccurrence`, `type`,
`autoCreated` (detected from history), `active`.

### Securities / Holdings / InvestmentTransaction
- `Security`: `id`, `symbol`, `name`, `type` (stock/etf/mutual-fund/bond/
  treasury/crypto/cash/other), `assetClass`, `currency`.
- `Holding`: `id`, `accountId`, `securityId`, `shares` (decimal, may be
  fractional), `costBasis` (cents), `currentPrice` (cents/share).
  Market value = `shares × currentPrice`, rounded to cents.
- `InvestmentTransaction`: `id`, `accountId`, `securityId`, `date`, `type`
  (buy/sell/dividend/interest/transfer/split/reinvest), `shares`, `price`,
  `amount`, `fees`, `notes`.

### Liability
`id`, `accountId` (the liability account), `interestRate` (APR %),
`minimumPayment`, `paymentDay`, `originalBalance`, `payoffStrategy`
(snowball/avalanche/custom).

### DashboardWidget
`id`, `kind` (net-worth/cash-flow/spending/budget/recent-transactions/upcoming/
goals/investments), `title`, `size` (small/medium/large), `sortOrder`,
`visible`, `config`.

### SavedReport
`id`, `name`, `kind`, `filters` (date range, accounts, categories, groups,
merchant, tags, type).

### ImportMapping
`id`, `headerFingerprint` (FNV-1a of the CSV header), `institution`,
`accountId`, `columns` (CSV column → target field), `dateFormat`, `delimiter`,
`lastUsed`. Reused automatically on subsequent imports from the same bank layout.

### ImportSession
`id`, `fileName`, `fileType` (csv/qfx/ofx), `accountId`, `mappingId`,
`totalRows`, `importedRows`, `skippedDuplicates`, timestamps.

### UserSettings (single row)
`theme` (light/dark/system), `currency`, `dateFormat`, `weekStart`,
`firstName`, `householdName`, `lastFlexAmount`, `demoDataLoaded`.

### Backup file (`ledgerly-backup-v1.json`)
```
{ format: "ledgerly-backup", version: 1, exportedAt, appVersion,
  data: { accounts, categoryGroups, categories, tags, transactions,
          splits, transfers, rules, budgets, budgetItems, goals,
          recurring, securities, holdings, investmentTransactions,
          liabilities, dashboard, settings, importMappings } }
```
Versioned so future versions can migrate old backups. Never contains passwords
or secrets.

---

## Relationships (ER-style)

```
CategoryGroup 1─n Category 1─n Transaction
Tag n─m Transaction (tagIds)
Account 1─n Transaction
Transaction 1─n TransactionSplit
Transaction 1─1 TransferPair (from/to)
Account 1─n Holding n─1 Security
Account 1─n InvestmentTransaction n─1 Security
Account 1─1 Liability
Budget 1─n BudgetItem n─1 Category
Goal n─m Account (accountIds)
RecurringTransaction n─1 Account, n─1 Category
```

## Multi-currency notes

`currency` exists on Account, Security, and UserSettings. Display formatting
uses each account's currency. Cross-currency conversion is not implemented in
local mode (out of scope for v1); the model is ready for it.

## Future: household/multi-user (REQ-046)

The model was designed so that a `Household` and `User` entity can be added in
server mode without restructuring: add `userId`/`householdId` columns and a
membership table; account-level sharing follows. `UserSettings.householdName`
and `firstName` already exist for the profile.

## Database (Dexie) schema

See `src/data/db.ts`. Indexes:

- `transactions`: `id`, `accountId`, `date`, `categoryId`, `merchant`, `type`,
  `reviewed`, `cleared`, `transferId`, `externalId`, `splitParentId`,
  `[accountId+date]`, `[accountId+externalId]`
- `splits`: `transactionId`, `categoryId`
- `holdings`: `accountId`, `securityId`
- `budgets`: `month`; `budgetItems`: `budgetId`, `categoryId`
- `importMappings`: `headerFingerprint`
- plus id-keyed collections for everything else.