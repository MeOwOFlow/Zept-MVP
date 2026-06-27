import { expectTypeOf } from 'vitest';
import type { UserProfile } from '../../src/types/user';

expectTypeOf<UserProfile>().toMatchTypeOf<{
  goal: string;
  daysToExam: number;
  topDistractions: string[];
  onboarded: boolean;
}>();
