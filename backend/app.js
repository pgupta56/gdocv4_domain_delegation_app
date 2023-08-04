// app.js

const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const fs = require('fs');

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', 'frontend/views');

// Replace 'your-gcp-project-number' with your actual GCP project number
const GCP_PROJECT_NUMBER = 'your-gcp-project-number';

// Replace 'serviceAccountKey.json' with your actual service account key file
const serviceAccountDetails = require('./serviceAccountKey.json');

//GIST :: https://gist.github.com/pgupta56/e2eebe28fa289538c891d6c5e9186a3a

async function performDomainWideDelegation(customerDomain, adminEmail, adminPassword) {
  try {
    // Authenticate the domain admin
    const authClient = await google.auth.getClient({
      credentials: {
        client_email: adminEmail,
        private_key: adminPassword,
        scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
      },
    });

    // Get the existing API client access entries
    const adminClient = google.admin({
      version: 'directory_v1',
      auth: authClient,
    });

    const { data: { items: existingEntries } } = await adminClient.resources.clients.list();

    // Check if the service account is already present in the API client access entries
    const serviceAccountClientId = serviceAccountDetails.client_email;
    const existingEntry = existingEntries.find((entry) => entry.clientId === serviceAccountClientId);

    if (!existingEntry) {
      // If the service account is not present, add a new entry for domain-wide delegation
      const entry = {
        clientId: serviceAccountClientId,
        apiAccess: serviceAccountDetails.scopes,
        displayName: serviceAccountDetails.name,
        projectNumber: GCP_PROJECT_NUMBER,
      };

      await adminClient.resources.clients.insert({ requestBody: entry });
      return true;
    } else {
      return false;
    }
  } catch (err) {
    console.error(`Error setting up domain-wide delegation for ${customerDomain}:`, err.message);

    // If the error is related to authentication, render the auth-error page
    if (err.message.includes('invalid_grant')) {
      throw new Error('Authentication Error');
    } else {
      throw err;
    }
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
    if (err.message === 'Authentication Error') {
      res.status(403).render('auth-error');
    } else {
      res.status(500).render('error', { customerDomain: req.body.customerDomain });
    }
});

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.post('/setup-delegation', async (req, res) => {
  const { customerDomain, adminEmail, adminPassword } = req.body;

  try {
    const delegationResult = await performDomainWideDelegation(customerDomain, adminEmail, adminPassword);

    if (delegationResult) {
      res.render('success', { customerDomain });
    } else {
      res.render('already-granted', { customerDomain });
    }
  } catch (err) {
    res.render('error', { customerDomain });
  }
});

// Server
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
