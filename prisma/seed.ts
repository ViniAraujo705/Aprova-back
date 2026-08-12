import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Cria o primeiro admin da plataforma a partir de variaveis de ambiente.
 * E o unico jeito de criar um admin: o POST /auth/register publico sempre
 * cria contas com role = owner, nunca admin (ver src/auth/auth.service.ts).
 * Idempotente: nao faz nada se ja existir um admin ou um usuario com o email.
 */
async function main() {
  const email = process.env.ADMIN_EMAIL;
  const senha = process.env.ADMIN_PASSWORD;
  const nome = process.env.ADMIN_NOME ?? 'Admin';

  if (!email || !senha) {
    console.log(
      'ADMIN_EMAIL / ADMIN_PASSWORD nao definidos - nenhum admin criado.',
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Usuario ${email} ja existe - nada a fazer.`);
    return;
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  const user = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: { nomeAgencia: 'Vistoow (admin)' },
    });
    return tx.user.create({
      data: {
        nome,
        email,
        senha: senhaHash,
        role: UserRole.admin,
        memberships: {
          create: { accountId: account.id, role: UserRole.admin },
        },
      },
    });
  });

  console.log(`Admin criado: ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
