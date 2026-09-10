/**
 * Default category groups & categories, created on first run.
 * Users can freely rename, reorder, archive, or delete these — nothing is hard-coded
 * into the application logic; this is only the initial seed data.
 */
import type { Category, CategoryGroup, Tag } from './types';
import { newId, nowISO } from '../lib/id';

export interface DefaultCategorySeed {
  group: Omit<CategoryGroup, 'id' | 'createdAt' | 'updatedAt'>;
  categories: string[];
}

export const DEFAULT_GROUP_SEEDS: DefaultCategorySeed[] = [
  {
    group: { name: 'Housing', sortOrder: 1, archived: false, kind: 'expense' },
    categories: ['Mortgage', 'Rent', 'Property Taxes', 'Home Insurance', 'Utilities', 'Internet & Phone', 'Maintenance'],
  },
  {
    group: { name: 'Transportation', sortOrder: 2, archived: false, kind: 'expense' },
    categories: ['Gas', 'Auto Insurance', 'Auto Maintenance', 'Public Transportation', 'Rideshare', 'Parking & Tolls'],
  },
  {
    group: { name: 'Food', sortOrder: 3, archived: false, kind: 'expense' },
    categories: ['Groceries', 'Restaurants', 'Coffee', 'Fast Food', 'Alcohol & Bars', 'Food Delivery'],
  },
  {
    group: { name: 'Health', sortOrder: 4, archived: false, kind: 'expense' },
    categories: ['Health Insurance', 'Medical', 'Dental', 'Pharmacy', 'Fitness', 'Vision'],
  },
  {
    group: { name: 'Personal', sortOrder: 5, archived: false, kind: 'expense' },
    categories: ['Clothing', 'Personal Care', 'Haircuts', 'Subscriptions', 'Memberships'],
  },
  {
    group: { name: 'Entertainment', sortOrder: 6, archived: false, kind: 'expense' },
    categories: ['Movies & Shows', 'Music', 'Games', 'Books', 'Hobbies', 'Events & Concerts'],
  },
  {
    group: { name: 'Shopping', sortOrder: 7, archived: false, kind: 'expense' },
    categories: ['Online Shopping', 'Electronics', 'Home Goods', 'Gifts', 'Office Supplies'],
  },
  {
    group: { name: 'Education', sortOrder: 8, archived: false, kind: 'expense' },
    categories: ['Tuition', 'Books & Supplies', 'Courses', 'Student Loan Interest'],
  },
  {
    group: { name: 'Travel', sortOrder: 9, archived: false, kind: 'expense' },
    categories: ['Flights', 'Hotels', 'Rental Cars', 'Vacation Activities'],
  },
  {
    group: { name: 'Kids', sortOrder: 10, archived: false, kind: 'expense' },
    categories: ['Childcare', 'School', 'Activities', 'Toys'],
  },
  {
    group: { name: 'Financial', sortOrder: 11, archived: false, kind: 'expense' },
    categories: ['Interest & Fees', 'Taxes', 'ATM Fees', 'Late Fees', 'Bank Fees'],
  },
  {
    group: { name: 'Other Expenses', sortOrder: 12, archived: false, kind: 'expense' },
    categories: ['Uncategorized', 'Miscellaneous'],
  },
  {
    group: { name: 'Income', sortOrder: 13, archived: false, kind: 'income' },
    categories: ['Salary', 'Bonus', 'Freelance', 'Interest Income', 'Dividends', 'Gifts Received', 'Refunds', 'Reimbursements', 'Other Income'],
  },
  {
    group: { name: 'Transfers', sortOrder: 14, archived: false, kind: 'transfer' },
    categories: ['Savings Transfer', 'Investment Transfer', 'Credit Card Payment', 'Internal Transfer'],
  },
];

export function buildDefaultCategorySeed(): { groups: CategoryGroup[]; categories: Category[] } {
  const now = nowISO();
  const groups: CategoryGroup[] = [];
  const categories: Category[] = [];
  DEFAULT_GROUP_SEEDS.forEach((seed) => {
    const group: CategoryGroup = {
      id: newId(),
      ...seed.group,
      sortOrder: seed.group.sortOrder,
      createdAt: now,
      updatedAt: now,
    };
    groups.push(group);
    seed.categories.forEach((name, ci) => {
      categories.push({
        id: newId(),
        groupId: group.id,
        name,
        sortOrder: ci + 1,
        archived: false,
        createdAt: now,
        updatedAt: now,
      });
    });
  });
  return { groups, categories };
}

/** System tags used by rule actions. Created lazily by the repository. */
export function systemTags(): Tag[] {
  const now = nowISO();
  return [
    { id: 'tag-exclude-budget', name: '__exclude_from_budget', createdAt: now, updatedAt: now },
    { id: 'tag-exclude-reports', name: '__exclude_from_reports', createdAt: now, updatedAt: now },
  ];
}