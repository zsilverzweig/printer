# Firebase Setup Guide for Printer

This guide will help you set up Firebase for authentication and data storage in Printer.

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter project name: `printer-ai` (or your preferred name)
4. Enable Google Analytics (optional)
5. Click "Create project"

## 2. Enable Authentication

1. In your Firebase project, go to **Authentication** in the left sidebar
2. Click **Get started**
3. Go to **Sign-in method** tab
4. Enable **Google** provider:
   - Click on Google
   - Toggle "Enable"
   - Add your project support email
   - Click "Save"

## 3. Set up Firestore Database

1. Go to **Firestore Database** in the left sidebar
2. Click **Create database**
3. Choose **Start in test mode** (for development)
4. Select a location (choose closest to your users)
5. Click "Done"

## 4. Get Firebase Configuration

1. Go to **Project Settings** (gear icon)
2. Scroll down to "Your apps" section
3. Click **Add app** and select **Web** (</> icon)
4. Register your app:
   - App nickname: `Printer Web`
   - Check "Also set up Firebase Hosting" (optional)
5. Click "Register app"
6. Copy the Firebase configuration object

## 5. Configure Environment Variables

1. Copy `env.template` to `.env.local`:

   ```bash
   cp env.template .env.local
   ```

2. Fill in your Firebase configuration in `.env.local`:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id_here
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id_here
   ```

## 6. Set up Firestore Security Rules

1. Go to **Firestore Database** → **Rules**
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Authenticated users can read/write agents
    match /agents/{agentId} {
      allow read, write: if request.auth != null;
    }

    // Authenticated users can read/write agent teams
    match /agent_teams/{teamId} {
      allow read, write: if request.auth != null;
    }

    // Authenticated users can read/write company research
    match /company_research/{researchId} {
      allow read, write: if request.auth != null;
    }

    // Authenticated users can read/write trade archetypes
    match /trade_archetypes/{archetypeId} {
      allow read, write: if request.auth != null;
    }

    // Authenticated users can read/write investment theses
    match /investment_theses/{thesisId} {
      allow read, write: if request.auth != null;
    }

    // Authenticated users can read/write market opportunities
    match /market_opportunities/{opportunityId} {
      allow read, write: if request.auth != null;
    }

    // Authenticated users can read/write AI requests and responses
    match /ai_requests/{requestId} {
      allow read, write: if request.auth != null;
    }

    match /ai_responses/{responseId} {
      allow read, write: if request.auth != null;
    }

    // Cost entries are read-only for users, write-only for system
    match /cost_entries/{entryId} {
      allow read: if request.auth != null;
      allow write: if false; // Only system can write cost entries
    }

    // Cache entries are read-only for users
    match /cache_entries/{entryId} {
      allow read: if request.auth != null;
      allow write: if false; // Only system can write cache entries
    }

    // Performance metrics are read-only for users
    match /performance_metrics/{metricId} {
      allow read: if request.auth != null;
      allow write: if false; // Only system can write metrics
    }

    // User sessions are private to each user
    match /user_sessions/{sessionId} {
      allow read, write: if request.auth != null &&
        resource.data.userId == request.auth.uid;
    }

    // Waitlist entries - users can read/write their own entries
    match /waitlist_entries/{entryId} {
      allow read, write: if request.auth != null &&
        resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
    }

    // Waitlist actions - users can read/write their own actions
    match /waitlist_actions/{actionId} {
      allow read, write: if request.auth != null &&
        resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
    }

    // Waitlist payments - users can read/write their own payments
    match /waitlist_payments/{paymentId} {
      allow read, write: if request.auth != null &&
        resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
    }

    // Waitlist config - read-only for authenticated users
    match /waitlist_config/{configId} {
      allow read: if request.auth != null;
      allow write: if false; // Only admins can write config
    }

    // Admin config - read-only for authenticated users, write for admins
    match /admin_config/{configId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        request.auth.token.email in ["admin@printer.ai", "zach@printer.ai"];
    }
  }
}
```

3. Click **Publish**

## 7. Set up Authentication Domain (for Production)

1. Go to **Authentication** → **Settings** → **Authorized domains**
2. Add your production domain (e.g., `yourdomain.com`)
3. For development, `localhost` is already included

## 8. Install Dependencies

```bash
npm install
```

## 9. Test the Setup

1. Start the development server:

   ```bash
   npm run dev
   ```

2. Navigate to `http://localhost:3000/login`
3. Click "Continue with Google"
4. Sign in with your Google account
5. You should be redirected to the main app

## 10. Admin Configuration

To set up admin users:

1. Go to **Authentication** → **Users**
2. Find your user and note the email
3. Update the admin emails in `src/lib/auth.ts`:
   ```typescript
   const adminEmails = ["your-email@gmail.com", "admin@printer.ai"];
   ```

## Troubleshooting

### Common Issues:

1. **"Firebase: Error (auth/unauthorized-domain)"**

   - Add your domain to authorized domains in Firebase Console

2. **"Firebase: Error (auth/api-key-not-valid)"**

   - Check your API key in `.env.local`
   - Make sure it matches the one in Firebase Console

3. **"Firestore: Missing or insufficient permissions"**

   - Check your Firestore security rules
   - Make sure the user is authenticated

4. **"Firebase: Error (auth/network-request-failed)"**
   - Check your internet connection
   - Verify Firebase project is active

### Development vs Production:

- **Development**: Use test mode for Firestore rules
- **Production**: Use proper security rules and enable App Check
- **Environment Variables**: Use different Firebase projects for dev/prod

## Next Steps

Once Firebase is set up:

1. Configure OpenAI API key in `.env.local`
2. Set up cost monitoring limits
3. Configure rate limiting
4. Set up vector database (Pinecone) for pattern matching
5. Configure monitoring and alerting

## Security Best Practices

1. **Never commit `.env.local`** to version control
2. **Use different Firebase projects** for development and production
3. **Enable App Check** for production
4. **Set up proper Firestore security rules**
5. **Monitor usage and costs** regularly
6. **Use Firebase Security Rules** to protect data
7. **Enable audit logging** for production
