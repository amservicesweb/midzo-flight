// api/track.js
export default async function handler(req, res) {
    // Récupérer le code court du partenaire depuis le paramètre 'ref'
    const { ref } = req.query;

    // Si un code de parrainage est présent, on l'enregistre
    if (ref) {
        // Pour l'instant, on log juste dans la console et on envoie un cookie au visiteur
        // Plus tard, vous pourrez enregistrer cela dans une base de données
        console.log(`[Midzo Affilié] Visite via le lien de : ${ref}`);
        
        // Créer un cookie pour que si le visiteur achète plus tard, on sache que c'est grâce à cet affilié
        res.setHeader('Set-Cookie', `midzo_ref=${ref}; Path=/; Max-Age=2592000`); // Cookie valable 30 jours
    }

    // Dans tous les cas, rediriger vers la page d'accueil de votre site
    res.writeHead(302, { Location: 'https://www.midzoflight.com/' });
    res.end();
}
