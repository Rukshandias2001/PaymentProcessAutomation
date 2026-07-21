from sqlalchemy import Column, String, Text, DateTime, Numeric, Integer
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class VendorInvoice(Base):
    __tablename__ = "vendor_invoices"
    
    itd_no = Column(String(255), primary_key=True)
    vendor_names = Column(String(255))
    invoice_took_date = Column(String(100))
    invoice_sent = Column(String(100))
    cost_center = Column(String(100))
    grn_number = Column(String(100))
    description = Column(Text)
    po_number = Column(String(100))
    status = Column(String(100))
    payment_type = Column(String(100), nullable=True)
    price = Column(Numeric(12, 2), nullable=True)
    total_goods = Column(Integer, nullable=True)
    purchased_goods = Column(Integer, nullable=True)
    vender_details = Column(Text)
    invoice_number = Column(String(100), unique=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    sent_to_signature_pending_at = Column(DateTime, nullable=True)
    approved_by_senior_manager_at = Column(DateTime, nullable=True)
    approved_by_head_of_it_at = Column(DateTime, nullable=True)
    approved_by_dgm_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    current_approver = Column(String(100), nullable=True)
    
    # Extra columns already present in the database table
    cost_center_id = Column(Integer, nullable=True)
    cost_center_name = Column(String(100), nullable=True)
    cost_center_type = Column(String(50), nullable=True)
    account_id = Column(Integer, nullable=True)
    account_number = Column(String(20), nullable=True)
    account_type = Column(String(50), nullable=True)

class CostCenter(Base):
    __tablename__ = "cost_centers"
    
    cost_center_id = Column(Integer, primary_key=True, autoincrement=True)
    cost_center_code = Column(String(4), nullable=False)
    cost_center_name = Column(String(100), nullable=False)
    cost_center_type = Column(String(50), nullable=False)

class Account(Base):
    __tablename__ = "accounts"
    
    account_id = Column(Integer, primary_key=True, autoincrement=True)
    account_number = Column(String(20), nullable=False)
    account_name = Column(String(100), nullable=False)
    account_type = Column(String(50), nullable=False)

class PaymentCertificate(Base):
    __tablename__ = "payment_certificates"
    
    certificate_no = Column(String(100), primary_key=True)
    itd_no = Column(String(255))
    amount_certified = Column(Numeric(12, 2))
    status = Column(String(50), default="Pending PM Approval")
    
    # 4 sequential approvals: PM, TL, FC, FD
    approver1_status = Column(String(20), default="Pending")
    approver1_name = Column(String(100), default="Project Manager")
    approver1_date = Column(DateTime, nullable=True)
    
    approver2_status = Column(String(20), default="Pending")
    approver2_name = Column(String(100), default="Technical Lead")
    approver2_date = Column(DateTime, nullable=True)
    
    approver3_status = Column(String(20), default="Pending")
    approver3_name = Column(String(100), default="Financial Controller")
    approver3_date = Column(DateTime, nullable=True)
    
    approver4_status = Column(String(20), default="Pending")
    approver4_name = Column(String(100), default="Finance Director")
    approver4_date = Column(DateTime, nullable=True)
    
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Logical relationship mapping back to VendorInvoice
    invoice = relationship(
        "VendorInvoice",
        primaryjoin="PaymentCertificate.itd_no == VendorInvoice.itd_no",
        foreign_keys=[itd_no],
    )


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(100), nullable=False)
    name = Column(String(100), nullable=False)


class UserSession(Base):
    __tablename__ = "user_sessions"
    token = Column(String(255), primary_key=True)
    user_id = Column(Integer, nullable=False)
    expires_at = Column(DateTime, nullable=False)
