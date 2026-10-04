import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROFILE_IDENTITY_CONFLICT_MESSAGE,
  escapeLikePattern,
  identityValuesMatch,
  isIdentityConflictError,
  normalizeIdentity,
} from './profile-identity';

test('normalising trims, collapses inner whitespace, and casefolds', () => {
  assert.equal(normalizeIdentity('  Maya  Kur '), 'maya kur');
  assert.equal(normalizeIdentity('MAYA'), 'maya');
  assert.equal(normalizeIdentity('\tMaya\nKur\r\n'), 'maya kur');
});

test('normalising handles empty and missing values', () => {
  assert.equal(normalizeIdentity(''), '');
  assert.equal(normalizeIdentity('   '), '');
  assert.equal(normalizeIdentity(null), '');
  assert.equal(normalizeIdentity(undefined), '');
});

test('identity values match regardless of case and spacing', () => {
  assert.equal(identityValuesMatch('Maya', '  maya '), true);
  assert.equal(identityValuesMatch('Maya  Kur', 'maya kur'), true);
});

test('blank identities never match each other', () => {
  assert.equal(identityValuesMatch('', ''), false);
  assert.equal(identityValuesMatch('   ', null), false);
  assert.equal(identityValuesMatch(null, undefined), false);
});

test('different identities do not match', () => {
  assert.equal(identityValuesMatch('maya', 'jamie'), false);
  assert.equal(identityValuesMatch('maya', 'mayak'), false);
});

test('like patterns escape wildcards so a name matches only itself', () => {
  assert.equal(escapeLikePattern('maya_k'), 'maya\\_k');
  assert.equal(escapeLikePattern('100%'), '100\\%');
  assert.equal(escapeLikePattern('star*'), 'star\\*');
  assert.equal(escapeLikePattern('back\\slash'), 'back\\\\slash');
});

test('a plain name is left alone', () => {
  assert.equal(escapeLikePattern('maya kur'), 'maya kur');
});

test('the unique violation code counts as an identity conflict', () => {
  assert.equal(isIdentityConflictError({ code: '23505', message: 'anything' }), true);
});

test('the trigger message counts as an identity conflict', () => {
  assert.equal(isIdentityConflictError({ message: PROFILE_IDENTITY_CONFLICT_MESSAGE }), true);
});

test('the handle index and column names count as an identity conflict', () => {
  assert.equal(isIdentityConflictError({ message: 'duplicate key value violates unique constraint "profiles_username_lower_key"' }), true);
  assert.equal(isIdentityConflictError({ message: 'duplicate key value violates unique constraint "profiles_display_name_key"' }), true);
});

test('unrelated failures are not identity conflicts', () => {
  assert.equal(isIdentityConflictError({ message: 'duplicate key value violates unique constraint "answers_pkey"' }), false);
  assert.equal(isIdentityConflictError({ message: 'connection refused' }), false);
  assert.equal(isIdentityConflictError({}), false);
  assert.equal(isIdentityConflictError(null), false);
  assert.equal(isIdentityConflictError(undefined), false);
});