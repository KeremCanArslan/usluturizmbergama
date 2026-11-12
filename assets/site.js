/* Uslu Turizm: teklif formu, ölçüm olayları, çerez bandı. Dış kütüphane yok. */
(function () {
  'use strict';

  var ayar = document.body.dataset;
  var FORM_ADRESI = ayar.form || '';
  var WHATSAPP = ayar.wa || '';
  var ETIKET = ayar.etiket || '';
  var KAMPANYA_ALANLARI = ['gclid', 'utm_source', 'utm_medium', 'utm_campaign'];
  var BEKLEME_MS = 30000;

  function sakla(anahtar, deger) {
    try { sessionStorage.setItem(anahtar, deger); } catch (h) { /* gizli pencere: saklanmaz */ }
  }
  function oku(anahtar) {
    try { return sessionStorage.getItem(anahtar) || ''; } catch (h) { return ''; }
  }
  function kalici(anahtar, deger) {
    try {
      if (deger === undefined) return localStorage.getItem(anahtar) || '';
      localStorage.setItem(anahtar, deger);
    } catch (h) { /* depolama kapalı */ }
    return '';
  }

  // Sayfa başına bir istek kimliği: sunucu cevabı kaybolup kişi yeniden basarsa kayıt ikinci kez yazılmaz.
  function yeniKimlik() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  function olcum(ad, ek) {
    if (typeof window.gtag === 'function') window.gtag('event', ad, ek || {});
  }

  // Reklam bağlantısından gelen kampanya bilgisi oturum boyunca saklanır, forma eklenir.
  var parametreler = new URLSearchParams(location.search);
  KAMPANYA_ALANLARI.forEach(function (ad) {
    var deger = parametreler.get(ad);
    if (deger) sakla('kampanya_' + ad, deger.slice(0, 200));
  });

  document.addEventListener('click', function (olay) {
    var baglanti = olay.target.closest('[data-olcum]');
    if (!baglanti) return;
    olcum(baglanti.dataset.olcum === 'telefon' ? 'telefon_tiklamasi' : 'whatsapp_tiklamasi');
  });

  function telefonGecerli(metin) {
    var rakam = metin.replace(/\D/g, '');
    if (rakam.indexOf('90') === 0 && rakam.length === 12) rakam = rakam.slice(2);
    if (rakam.charAt(0) === '0') rakam = rakam.slice(1);
    return rakam.length === 10 && /^[2-5]/.test(rakam);
  }

  function hataGoster(alan, mesaj, goster) {
    if (!mesaj) return;
    mesaj.hidden = !goster;
    if (alan) alan.setAttribute('aria-invalid', goster ? 'true' : 'false');
  }

  function waMetni(veri) {
    var hizmetAdi = { personel: 'Personel taşımacılığı', ogrenci: 'Öğrenci taşımacılığı', diger: 'Diğer' };
    var satirlar = ['Merhaba, servis için teklif istiyorum.'];
    var etiketler = [
      ['firma', 'Firma'], ['yetkili', 'Yetkili'], ['telefon', 'Telefon'], ['hizmet', 'Hizmet'],
      ['guzergah', 'Güzergah'], ['saatler', 'Saatler'], ['kisi', 'Kişi sayısı'], ['not', 'Not']
    ];
    etiketler.forEach(function (c) {
      var deger = c[0] === 'hizmet' ? hizmetAdi[veri.get('hizmet')] : veri.get(c[0]);
      if (deger) satirlar.push(c[1] + ': ' + String(deger).trim());
    });
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(satirlar.join('\n'));
  }

  function sonucGoster(form, tur, veri) {
    var kutu = form.parentNode;
    var panel = kutu.querySelector('[data-sonuc="' + tur + '"]');
    if (tur === 'yedek' && veri) {
      var wa = panel.querySelector('[data-yedek-wa]');
      if (wa) wa.href = waMetni(veri);
    }
    form.hidden = true;
    panel.hidden = false;
    panel.focus();
  }

  document.querySelectorAll('form[data-teklif]').forEach(function (form) {
    var telefon = form.elements.telefon;
    var kvkk = form.elements.kvkk;
    var telefonHata = form.querySelector('#telefon-hata');
    var kvkkHata = form.parentNode.querySelector('#kvkk-hata');
    var durum = form.querySelector('.form-durum');
    var dugme = form.querySelector('button[type="submit"]');
    var istekKimligi = yeniKimlik();

    KAMPANYA_ALANLARI.forEach(function (ad) {
      if (form.elements[ad]) form.elements[ad].value = oku('kampanya_' + ad);
    });

    telefon.addEventListener('input', function () {
      if (telefon.getAttribute('aria-invalid') === 'true' && telefonGecerli(telefon.value)) {
        hataGoster(telefon, telefonHata, false);
      }
    });
    kvkk.addEventListener('change', function () { if (kvkk.checked) hataGoster(kvkk, kvkkHata, false); });

    form.addEventListener('submit', function (olay) {
      olay.preventDefault();
      durum.textContent = '';

      // Bal küpü doluysa gönderim sessizce teşekkür ekranına geçer, kayıt yapılmaz.
      if (form.elements.web.value) { sonucGoster(form, 'tamam'); return; }

      var telefonTamam = telefonGecerli(telefon.value);
      hataGoster(telefon, telefonHata, !telefonTamam);
      hataGoster(kvkk, kvkkHata, !kvkk.checked);
      if (!telefonTamam) { telefon.focus(); return; }
      if (!kvkk.checked) { kvkk.focus(); return; }

      var son = Number(oku('son_gonderim') || 0);
      if (Date.now() - son < BEKLEME_MS) {
        durum.textContent = 'İsteğiniz az önce gönderildi. Yeni bir istek için yarım dakika bekleyin.';
        return;
      }

      var veri = new FormData(form);
      veri.set('sayfa', location.pathname);
      veri.set('istek', istekKimligi);
      veri.delete('web');

      if (!FORM_ADRESI) { sonucGoster(form, 'yedek', veri); return; }

      dugme.disabled = true;
      durum.textContent = 'Gönderiliyor...';
      fetch(FORM_ADRESI, { method: 'POST', body: new URLSearchParams(veri) })
        .then(function (cevap) { return cevap.ok ? cevap.json() : Promise.reject(cevap.status); })
        .then(function (sonuc) {
          if (!sonuc || sonuc.durum !== 'tamam') return Promise.reject('cevap');
          sakla('son_gonderim', String(Date.now()));
          olcum('teklif_formu', { hizmet: veri.get('hizmet') || '' });
          sonucGoster(form, 'tamam');
        })
        .catch(function () { sonucGoster(form, 'yedek', veri); })
        .then(function () { dugme.disabled = false; durum.textContent = ''; });
    });
  });

  // Çerez bandı: yalnız Google etiketi kuruluysa görünür.
  var bant = document.querySelector('[data-cerez]');
  if (ETIKET && bant && !kalici('cerez')) {
    bant.hidden = false;
    bant.addEventListener('click', function (olay) {
      var secim = olay.target.getAttribute('data-cerez-secim');
      if (!secim) return;
      kalici('cerez', secim);
      if (secim === 'kabul' && typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          ad_storage: 'granted', ad_user_data: 'granted',
          ad_personalization: 'granted', analytics_storage: 'granted'
        });
      }
      bant.hidden = true;
    });
  }
})();
