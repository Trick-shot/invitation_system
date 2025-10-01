# 🎟️ QR Code Invitation System

A digital invitation system built with **Django (backend)**, **React (frontend)**, and **MySQL (database)**.  
It allows event organizers to generate **QR code invitations**, share them with guests, and verify attendance by scanning the codes at the event entrance.  

---

## ✨ Features
- 📩 Generate and send QR code invitations  
- 🔒 Secure guest verification through QR scanning  
- 📊 Attendance tracking stored in MySQL  
- 🎨 Customizable invitations with event branding  
- 📱 Mobile-friendly for guests to use on their devices  

---

## 🚀 Tech Stack
- **Backend**: Django + Django REST Framework  
- **Frontend**: React  
- **Database**: MySQL  
- **QR Code**: Python `qrcode` library  
- **Authentication**: JWT or session-based  

---

## ⚙️ How It Works
1. Organizer creates an event and uploads guest details  
2. System generates a **unique QR code** for each guest  
3. Invitations are shared via **link, email, or printable card**  
4. At the event, QR codes are scanned for verification  
5. Django backend validates the guest and marks attendance in MySQL  

---

## 📦 Installation

### 🔧 Backend (Django)
```bash
# Clone the repo
git clone https://github.com/yourusername/invitation-system.git
cd invitation-system/backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Apply migrations
python manage.py migrate

# Run server
python manage.py runserver
