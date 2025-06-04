from fastapi import FastAPI
from jose import jwt, JWTError
from datetime import datetime, timedelta
from typing import Optional

# Configuration
SECRET_KEY = "5YrDmWXPb5IzgFycsKIChUKu7+6TDfG1t7Gnm4SNZJ8="
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/hello/{name}")
async def say_hello(name: str):
    return {"message": f"Hello {name}"}

@app.post("/token")
async def create_access_token():
    user_data = {
        'user_name': 'Max Den',
        'user_role': 'Customer',
        'user_data_access': 'Full',
        'user_email': 'max.den@example.com'
    }
    to_encode = user_data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return {"access_token": encoded_jwt, "token_type": "bearer"}

#            user_name: 'Max Den', // Example user data
#            user_role: 'Customer',
#            user_data_access: 'Full',
#            user_email: 'max.den@example.com',

# To run this app:
# 1. Make sure you are in the 'server' directory.
# 2. Make sure your virtual environment is activated: source venv/bin/activate
# 3. Run: uvicorn main:app --reload 