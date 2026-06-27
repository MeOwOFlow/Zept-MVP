import { expectTypeOf } from 'vitest';
import type { UserProfile } from '../../src/types/user';

expectTypeOf<UserProfile>().toMatchTypeOf<{
  goal: string;
  examDate: string;
  topDistractions: string[];
  onboarded: boolean;
}>();
