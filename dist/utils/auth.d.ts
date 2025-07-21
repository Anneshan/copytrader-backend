export declare const hashPassword: (password: string) => Promise<string>;
export declare const comparePassword: (password: string, hash: string) => Promise<boolean>;
export declare const generateTokens: (userId: string, ipAddress?: string, userAgent?: string) => Promise<{
    accessToken: string;
    refreshToken: string;
}>;
export declare const verifyToken: (token: string, secret: string) => any;
//# sourceMappingURL=auth.d.ts.map