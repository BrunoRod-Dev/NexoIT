"""Crea o actualiza un usuario administrador de NexoIT.

Uso:
    python create_admin.py <email> <password> [nombre]

- Si el email no existe, crea el usuario con rol admin.
- Si ya existe, actualiza password, nombre y fuerza rol=admin.
"""

from __future__ import annotations

import sys

import auth
from models import SessionLocal, User, init_db


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("Uso: python create_admin.py <email> <password> [nombre]")
        return 2

    email = auth.normalize_email(argv[1])
    password = argv[2]
    nombre = (argv[3] if len(argv) > 3 else "Admin").strip() or "Admin"

    if len(nombre) > 120:
        print("El nombre no puede superar los 120 caracteres.")
        return 2
    if not auth.valid_email(email):
        print(f"Email inválido: {email!r}")
        return 2
    if not auth.valid_password(password):
        print("La contraseña necesita al menos 8 caracteres.")
        return 2
    if len(password.encode("utf-8")) > 72:
        print("La contraseña no puede superar los 72 caracteres (límite de bcrypt).")
        return 2

    init_db()
    with SessionLocal() as db:
        user = auth.get_user_by_email(db, email)
        if user is None:
            user = User(
                email=email,
                password_hash=auth.hash_password(password),
                nombre=nombre,
                rol="admin",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Admin creado: {user.email} (id={user.id})")
            return 0

        user.password_hash = auth.hash_password(password)
        user.rol = "admin"
        user.nombre = nombre
        db.commit()
        print(f"Admin actualizado: {user.email} (id={user.id})")
        return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
