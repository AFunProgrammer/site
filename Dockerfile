FROM node:20-slim

# Set the working directory inside the container
WORKDIR /app

# Copy package files first (better for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your site files
COPY . .

# Your app's port (change if it uses something else)
EXPOSE 3000
EXPOSE 3443

CMD ["node", "app.js"]
