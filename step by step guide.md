Step-by-Step Guide                                                                                                                                     
                                                                                                                                                           
  Step 1: Deploy Frontend to Vercel
                                                                                                                                                           
  1. Go to vercel.com and sign up with your GitHub account                                                                                                 
  2. Click "Add New Project"
  3. Select your Ai-product-sense repository                                                                                                               
  4. Vercel will auto-detect Next.js. Set these:                                                                                                           
    - Root Directory: frontend                                                                                                                             
    - Framework Preset: Next.js (auto-detected)                                                                                                            
  5. Click "Environment Variables" and add:                                                                                                                
    - NEXT_PUBLIC_SUPABASE_URL → (same value from your frontend/.env.local)                                                                                
    - NEXT_PUBLIC_SUPABASE_ANON_KEY → (same value from frontend/.env.local)                                                                                
    - NEXT_PUBLIC_API_URL → (we'll fill this after backend is deployed)                                                                                    
    - NEXT_PUBLIC_WS_URL → (we'll fill this after backend is deployed)                                                                                     
  6. Click Deploy                                                                                                                                          
                                                                                                                                                           
  You'll get a URL like https://ai-product-sense.vercel.app                                                                                                
   
  Step 2: Deploy Backend to Railway                                                                                                                        
                                                                                                                                                         
  1. Go to railway.app and sign up with your GitHub account                                                                                                
  2. Click "New Project" → "Deploy from GitHub Repo"
  3. Select your Ai-product-sense repository                                                                                                               
  4. Railway will ask for config. Set:                                                                                                                   
    - Root Directory: backend                                                                                                                              
    - Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
  5. Go to the Variables tab and add all values from your backend/.env:                                                                                    
    - SUPABASE_URL                                                                                                                                       
    - SUPABASE_KEY (service role key)                                                                                                                      
    - SUPABASE_JWT_SECRET                                                                                                                                
    - CORS_ORIGINS → set to your Vercel URL, e.g. https://ai-product-sense.vercel.app                                                                      
  6. Railway will auto-deploy and give you a URL like https://ai-product-sense-backend.up.railway.app                                                      
                                                                                                                                                           
  Step 3: Connect Frontend to Backend                                                                                                                      
                                                                                                                                                           
  Go back to Vercel → Project Settings → Environment Variables and update:                                                                                 
  - NEXT_PUBLIC_API_URL = https://your-railway-url.up.railway.app/api/v1
  - NEXT_PUBLIC_WS_URL = wss://your-railway-url.up.railway.app/api/v1                                                                                      
                                                                                                                                                         
  Then click Redeploy in Vercel.                                                                                                                           
                                                                                                                                                         
  ---                                                                                                                                                      
  After That                                                                                                                                             
                                                                                                                                                           
  Every time we push to GitHub:
  - Vercel auto-deploys the frontend                                                                                                                       
  - Railway auto-deploys the backend                                                                                                                     
  - No manual steps needed          
                                                                                                                                                           
  Want to start? I can help you check your env variables are ready and make sure CORS_ORIGINS in the backend config supports the production URL.
  