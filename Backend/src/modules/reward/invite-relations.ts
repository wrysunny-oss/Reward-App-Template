export function formatPublicUserAccount(userId: bigint) {
  return `UID${userId.toString().padStart(8, "0")}`;
}

export function presentInviteMember(user: { id: bigint; nickname: string; phone: string }) {
  return {
    userNo: formatPublicUserAccount(user.id),
    nickname: user.nickname,
    phone: user.phone,
  };
}
