const BRAND = {
  forest: "#1B5E20",
  forestLight: "#2E7D32",
  lavender: "#8B7CB8",
  lavender50: "#F5F3FA",
  cream: "#FDFBF7",
  gray: "#6B7280",
};

interface ContactData {
  name: string;
  company: string;
  email: string;
  phone: string;
  message: string;
}

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:${BRAND.cream};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.cream};padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:30px 40px;background-color:${BRAND.forest};border-radius:16px 16px 0 0;">
              <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:1px;">
                Linge Serein
              </h1>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.7);letter-spacing:0.5px;">
                Votre linge, notre s\u00e9r\u00e9nit\u00e9
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:40px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:${BRAND.lavender50};padding:24px 40px;border-radius:0 0 16px 16px;border:1px solid #e5e7eb;border-top:none;">
              <p style="margin:0;font-size:12px;color:${BRAND.gray};text-align:center;line-height:1.6;">
                Linge Serein &mdash; Service de linge h\u00f4telier<br>
                Orange, Vaucluse &mdash; 06 85 21 82 70<br>
                lingeserein@gmail.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function confirmationEmail(data: ContactData): string {
  return layout(`
    <h2 style="margin:0 0 20px;font-size:22px;color:${BRAND.forest};font-weight:600;">
      Merci pour votre demande, ${data.name}
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:${BRAND.gray};line-height:1.7;">
      Nous avons bien re\u00e7u votre demande de devis pour
      <strong style="color:${BRAND.forest};">${data.company}</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.gray};line-height:1.7;">
      Notre \u00e9quipe va \u00e9tudier vos besoins et vous recontacter
      <strong style="color:${BRAND.forest};">sous 24 heures ouvr\u00e9es</strong>
      pour vous proposer une offre personnalis\u00e9e.
    </p>
    <div style="background-color:${BRAND.lavender50};border-radius:12px;padding:20px 24px;margin-bottom:24px;border-left:4px solid ${BRAND.lavender};">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${BRAND.forest};">Votre message :</p>
      <p style="margin:0;font-size:14px;color:${BRAND.gray};line-height:1.6;font-style:italic;">
        "${data.message}"
      </p>
    </div>
    <p style="margin:0;font-size:14px;color:${BRAND.gray};line-height:1.7;">
      En attendant, n'h\u00e9sitez pas \u00e0 nous appeler au
      <a href="tel:+33685218270" style="color:${BRAND.forest};font-weight:600;text-decoration:none;">06 85 21 82 70</a>
      pour toute question.
    </p>
  `);
}

export function notificationEmail(data: ContactData): string {
  return layout(`
    <h2 style="margin:0 0 20px;font-size:22px;color:${BRAND.forest};font-weight:600;">
      Nouvelle demande de devis
    </h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:12px 16px;background-color:${BRAND.lavender50};border-radius:8px 8px 0 0;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">Nom</span><br>
          <span style="font-size:15px;color:${BRAND.forest};font-weight:600;">${data.name}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">\u00c9tablissement</span><br>
          <span style="font-size:15px;color:${BRAND.forest};font-weight:600;">${data.company}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:${BRAND.lavender50};border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">Email</span><br>
          <a href="mailto:${data.email}" style="font-size:15px;color:${BRAND.forest};font-weight:600;text-decoration:none;">${data.email}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">T\u00e9l\u00e9phone</span><br>
          <a href="tel:${data.phone}" style="font-size:15px;color:${BRAND.forest};font-weight:600;text-decoration:none;">${data.phone}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:${BRAND.lavender50};border-radius:0 0 8px 8px;">
          <span style="font-size:12px;color:${BRAND.gray};text-transform:uppercase;letter-spacing:0.5px;">Message</span><br>
          <span style="font-size:15px;color:#374151;line-height:1.6;">${data.message}</span>
        </td>
      </tr>
    </table>
    <a href="mailto:${data.email}?subject=Re: Demande de devis Linge Serein"
       style="display:inline-block;background-color:${BRAND.forest};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:50px;font-size:14px;font-weight:600;">
      R\u00e9pondre au client
    </a>
  `);
}
