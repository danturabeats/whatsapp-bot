# השתמש בגרסת בסיס רזה של Node.js
FROM node:18-bullseye-slim

# התקן את התלויות הדרושות לדפדפן כרום (זה החלק הקריטי)
# הקוד הזה נלקח מהתיעוד הרשמי של Puppeteer
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# הגדר את תיקיית העבודה בתוך הקונטיינר
WORKDIR /app

# העתק את קבצי התלות והתקן אותם (לניצול טוב יותר של ה-cache)
COPY package*.json ./
RUN npm install

# העתק את כל שאר קוד המקור
COPY . .

# פקודת ההפעלה שתרוץ כשהקונטיינר יתחיל
CMD [ "node", "index.js" ]