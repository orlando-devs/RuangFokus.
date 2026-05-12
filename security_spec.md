# Security Specification: Study Group Application

## Data Invariants
1. A user can only edit their own profile.
2. A user can only read group data if they are a member of that group.
3. Groups can only be renamed or deleted by their creator.
4. Chat messages can only be sent by members of the group.
5. Study Group codes must be exactly 6 alphanumeric characters.

## The "Dirty Dozen" Payloads (Expect: PERMISSION_DENIED)
1. Update user profile of another UID.
2. Set `currentStreak` to a non-number.
3. Create a group where `members` list doesn't include the creator.
4. Rename a group where requester is not the `creatorId`.
5. Join a group by forcing UID into `members` array without using the group code (client-side bypass attempt).
6. Read `groups/{groupId}/messages` without being in the `members` list of `groups/{groupId}`.
7. Send a message as someone else (`senderId` != `auth.uid`).
8. Inject a 1MB string into a chat message content.
9. Update a message after it has been sent (immutability check).
10. Delete a message (if not allowed).
11. Update `creatorId` of a group after creation.
12. Create a user document with a missing `displayName`.

## Test Runner (Draft)
Verification of these invariants will be handled by the Hardened Rules logic.
