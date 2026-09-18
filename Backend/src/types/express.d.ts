declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: bigint;
        permissions: string[];
        roleCodes: string[];
        accountType: "ADMIN" | "AGENT" | "USER";
      };
    }
  }
}
export {};
