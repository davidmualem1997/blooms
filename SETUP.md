# הקמת שולחן הפיד

אחרי ארבעת השלבים האלה אפשר להתחבר עם Google ולראות את הדאשבורד. כל שלב לוקח כמה דקות.

## 1. פרויקט ב-Supabase
1. נכנסים ל-https://supabase.com/dashboard ויוצרים פרויקט חדש. אזור: `eu-central-1` (פרנקפורט) הוא הקרוב לישראל.
2. ב-**Project Settings ← API** מעתיקים את **Project URL** ואת ה-**Publishable key**.
3. בתיקיית הפרויקט:
   ```bash
   cp .env.example .env.local   # ממלאים את שני הערכים
   ```

## 2. כניסה עם Google
1. ב-Google Cloud Console יוצרים פרויקט, ומגדירים **OAuth consent screen** מסוג External.
2. יוצרים **OAuth client ID** מסוג Web application.
3. תחת **Authorized redirect URIs** מוסיפים את הכתובת שמופיעה ב-Supabase תחת **Authentication ← Providers ← Google**. היא נראית כך: `https://<project>.supabase.co/auth/v1/callback`.
4. מעתיקים את ה-Client ID ואת ה-Client Secret ל-Supabase, באותו מסך של Google, ומפעילים את הספק.
5. ב-Supabase, ב-**Authentication ← URL Configuration**:
   - **Site URL**: `http://localhost:3000`. אחרי העלייה לאוויר מחליפים לכתובת ב-Vercel.
   - **Redirect URLs**: `http://localhost:3000/auth/callback`, ואחר כך גם הכתובת ב-Vercel עם `/auth/callback`.

## 3. סכמת מסד הנתונים
```bash
npx supabase login
npx supabase link --project-ref <project-ref>   # ה-ref מופיע בכתובת של הפרויקט
npx supabase db push                            # מריץ את supabase/migrations
```

## 4. הרצה
```bash
npm run dev
```
פותחים את http://localhost:3000 ונכנסים עם Google. בכניסה הראשונה פותחים סטודיו, ומי שפתח אותו הופך למנהלת הסטודיו. לכן כדאי שיולי תהיה הראשונה שנכנסת.

## מבנה ההרשאות
| תפקיד | מה רואה |
| --- | --- |
| מנהלת הסטודיו (`owner`) | כל הלקוחות. מוסיפה ומוחקת לקוחות, קובעת מנהל לקוח ומזמינה משתמשים |
| מנהל/ת לקוחות (`manager`) | רק לקוחות שבהם `clients.manager_id` שווה לו או לה |
| משתמש/ת לקוח (`client_users`) | רק את הלקוח שלו. לא רואה משימות צוות, ומאשר או מבקש תיקון דרך `review_item()` |

ההרשאות נאכפות ב-Row Level Security, בקובץ `supabase/migrations/…_init.sql`.

**הזמנת אנשים:** מוסיפים שורה ל-`invites` עם המייל של האדם. כשהוא נכנס עם Google באותה כתובת, הוא מקבל את הגישה אוטומטית. בשלב הבא יהיה לזה מסך באפליקציה.
