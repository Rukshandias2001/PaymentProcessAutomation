import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 1. Update your target database schema name here if needed
DATABASE_NAME = "malwareFilesUpload"

# 2. Connect using the root user along with your password 'rootpassword123'
if os.path.exists("/tmp/mysql.sock"):
    SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://root:rootpassword123@localhost/{DATABASE_NAME}?unix_socket=/tmp/mysql.sock"
else:
    SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://root:rootpassword123@127.0.0.1:3306/{DATABASE_NAME}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get db session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
