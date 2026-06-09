import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { MAX_LOGIN_ATTEMPTS, JWT_REFRESH_TOKEN_EXPIRY } from "@lingengo/shared";
import { UnauthorizedError, AccountLockedError, NotFoundError } from "../utils/errors.js";
import { createAuditLog } from "../utils/audit.js";
import { encrypt } from "../utils/crypto.js";

const BCRYPT_ROUNDS = 12;

interface RegisterParams {
  email: string;
  password: string;
  name: string;
  address: string;
  accommodationType: "AIRBNB" | "GITE" | "AUBERGE" | "HOTEL" | "AUTRE";
  operatorId: string;
  zoneId?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface LoginParams {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly app: FastifyInstance,
  ) {}

  /** Inscription d'un nouveau client.
   *
   * Anti-énumération : si l'email existe déjà, on retourne un résultat
   * générique sans lever d'erreur ni créer de doublon en base.
   * La réponse HTTP 201 et le message sont identiques dans les deux cas.
   */
  async register(
    params: RegisterParams,
  ): Promise<{ userId: string | null; emailVerificationToken: string | null }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: params.email },
    });

    if (existing) {
      // Ne pas révéler que l'email est pris — répondre silencieusement.
      // Pas de création en base, pas d'envoi d'email.
      return { userId: null, emailVerificationToken: null };
    }

    const passwordHash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);
    const encryptionKey = process.env["ENCRYPTION_KEY"]!;

    const user = await this.prisma.user.create({
      data: {
        email: params.email,
        passwordHash,
        name: params.name,
        address: encrypt(params.address, encryptionKey),
        accommodationType: params.accommodationType,
        role: "ROLE_CLIENT",
        operatorId: params.operatorId,
        zoneId: params.zoneId,
      },
    });

    // Générer le token de vérification email (expire 24h)
    const verificationToken = randomBytes(32).toString("hex");
    await this.prisma.emailVerification.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId: user.id,
      action: "CREATE",
      entity: "User",
      entityId: user.id,
      changes: { role: "ROLE_CLIENT", accommodationType: params.accommodationType },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return { userId: user.id, emailVerificationToken: verificationToken };
  }

  /** Connexion — retourne un access + refresh token */
  async login(params: LoginParams): Promise<TokenPair & { userId: string; role: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: params.email, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedError("Email ou mot de passe incorrect");
    }

    // Vérifier le verrouillage
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AccountLockedError();
    }

    // Vérifier le mot de passe
    const passwordValid = await bcrypt.compare(params.password, user.passwordHash);

    if (!passwordValid) {
      const newAttempts = user.loginAttempts + 1;

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        // Verrouiller le compte (30 minutes)
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            loginAttempts: newAttempts,
            lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
          },
        });

        await createAuditLog({
          prisma: this.prisma,
          userId: user.id,
          action: "ACCOUNT_LOCKED",
          entity: "User",
          entityId: user.id,
          changes: { loginAttempts: newAttempts },
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        });

        throw new AccountLockedError();
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: newAttempts },
      });

      await createAuditLog({
        prisma: this.prisma,
        userId: user.id,
        action: "LOGIN_FAILED",
        entity: "User",
        entityId: user.id,
        changes: { loginAttempts: newAttempts },
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });

      throw new UnauthorizedError("Email ou mot de passe incorrect");
    }

    // Vérification email
    if (!user.isEmailVerified) {
      throw new UnauthorizedError("Veuillez vérifier votre email avant de vous connecter");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("Compte désactivé");
    }

    // Reset login attempts on success
    await this.prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null },
    });

    const tokens = await this.generateTokenPair(user.id, user.role);

    await createAuditLog({
      prisma: this.prisma,
      userId: user.id,
      action: "LOGIN",
      entity: "User",
      entityId: user.id,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return { ...tokens, userId: user.id, role: user.role };
  }

  /** Rafraîchir les tokens (rotation du refresh token) */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      // Si le token a été révoqué, c'est potentiellement une réutilisation malveillante :
      // révoquer TOUS les tokens de l'utilisateur
      if (stored?.revokedAt) {
        await this.revokeAllUserTokens(stored.userId);
      }
      throw new UnauthorizedError("Refresh token invalide ou expiré");
    }

    if (!stored.user.isActive || stored.user.deletedAt) {
      throw new UnauthorizedError("Compte désactivé");
    }

    // Révoquer l'ancien refresh token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokenPair(stored.userId, stored.user.role);
  }

  /** Déconnexion — révoquer le refresh token */
  async logout(
    refreshToken: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken, userId },
      data: { revokedAt: new Date() },
    });

    await createAuditLog({
      prisma: this.prisma,
      userId,
      action: "LOGOUT",
      entity: "User",
      entityId: userId,
      ipAddress,
      userAgent,
    });
  }

  /** Vérification de l'email */
  async verifyEmail(token: string, ipAddress?: string, userAgent?: string): Promise<void> {
    const verification = await this.prisma.emailVerification.findUnique({
      where: { token },
    });

    if (!verification || verification.usedAt || verification.expiresAt < new Date()) {
      throw new NotFoundError("Token de vérification invalide ou expiré");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verification.userId },
        data: { isEmailVerified: true, emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerification.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await createAuditLog({
      prisma: this.prisma,
      userId: verification.userId,
      action: "UPDATE",
      entity: "User",
      entityId: verification.userId,
      changes: { isEmailVerified: true },
      ipAddress,
      userAgent,
    });
  }

  /** Révoquer tous les tokens d'un utilisateur (compromission) */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Invalider aussi dans Redis (blacklist des access tokens en cours)
    await this.redis.set(`user:${userId}:tokens_revoked_at`, Date.now().toString(), "EX", 900);
  }

  // ---- private ----

  private async generateTokenPair(userId: string, role: string): Promise<TokenPair> {
    const accessToken = this.app.jwt.sign({ sub: userId, role });

    const refreshToken = randomBytes(48).toString("hex");
    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt: new Date(Date.now() + JWT_REFRESH_TOKEN_EXPIRY * 1000),
      },
    });

    return { accessToken, refreshToken };
  }
}
