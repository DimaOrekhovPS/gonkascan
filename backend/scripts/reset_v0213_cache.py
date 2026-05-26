#!/usr/bin/env python3
import argparse
import sqlite3


EPOCH_TABLES = (
    "confirmation_data",
    "inference_stats",
    "epoch_status",
    "participant_rewards",
    "epoch_total_rewards",
    "models",
    "models_api_cache",
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Clear cached epoch rows that v0.2.13 recalculates on-chain."
    )
    parser.add_argument("db_path", help="Path to the dashboard SQLite cache DB")
    parser.add_argument(
        "--from-epoch",
        type=int,
        help="Clear every cached epoch greater than or equal to this epoch",
    )
    parser.add_argument(
        "--epoch",
        type=int,
        action="append",
        default=[],
        help="Clear one epoch. May be provided multiple times",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print matching row counts without deleting anything",
    )
    return parser.parse_args()


def table_exists(db, table):
    row = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def where_clause(args):
    clauses = []
    values = []

    if args.from_epoch is not None:
        clauses.append("epoch_id >= ?")
        values.append(args.from_epoch)

    if args.epoch:
        placeholders = ", ".join("?" for _ in args.epoch)
        clauses.append(f"epoch_id IN ({placeholders})")
        values.extend(args.epoch)

    if not clauses:
        raise SystemExit("Provide --from-epoch or at least one --epoch")

    return " OR ".join(f"({clause})" for clause in clauses), values


def main():
    args = parse_args()
    where_sql, values = where_clause(args)

    with sqlite3.connect(args.db_path) as db:
        total = 0
        for table in EPOCH_TABLES:
            if not table_exists(db, table):
                continue

            count = db.execute(
                f"SELECT COUNT(*) FROM {table} WHERE {where_sql}",
                values,
            ).fetchone()[0]
            total += count
            print(f"{table}: {count} rows")

            if count and not args.dry_run:
                db.execute(f"DELETE FROM {table} WHERE {where_sql}", values)

        if args.dry_run:
            print(f"dry run: {total} rows would be deleted")
            return

        db.commit()
        print(f"deleted {total} cached rows")


if __name__ == "__main__":
    main()
