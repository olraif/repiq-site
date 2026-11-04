(function(){
  const EMAIL='oge-na-5@mail.ru';
  const services={
    trainer:{label:'Доступ к тренажёру',offer:'./legal/offer-trainer.html',consent:'./legal/consent-trainer.html',privacy:'./legal/privacy-trainer.html',offerVersion:'trainer-2026-11-04',consentVersion:'trainer-2026-11-04'},
    tutoring:{label:'Занятия с репетитором',offer:'./legal/offer-tutoring.html',consent:'./legal/consent-tutoring.html',privacy:'./legal/privacy-tutoring.html',offerVersion:'tutoring-2026-11-04',consentVersion:'tutoring-2026-11-04'}
  };
  const form=document.getElementById('request-form');
  const choices=[...document.querySelectorAll('[data-service]')];
  const next=document.getElementById('next');
  const error=document.getElementById('form-error');
  const mailStep=document.getElementById('mail-step');
  const copyButton=document.getElementById('copy-request');
  const manualCopy=document.getElementById('manual-copy');
  let requestText='';
  function showError(message){error.textContent=message;error.hidden=!message;}
  choices.forEach(button=>button.addEventListener('click',()=>{
    const service=services[button.dataset.service];
    if(!service)return;
    choices.forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button)));
    form.elements.service.value=button.dataset.service;
    document.getElementById('offer-link').href=service.offer;
    document.getElementById('consent-link').href=service.consent;
    document.getElementById('privacy-link').href=service.privacy;
    form.elements.offer_read.checked=false;
    form.elements.processing_consent.checked=false;
    showError('');
    mailStep.hidden=true;
    manualCopy.hidden=true;
    next.hidden=false;
  }));
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const service=services[form.elements.service.value];
    if(!service){showError('Выберите услугу.');return;}
    const payerName=form.elements.payer_name.value.trim();
    const studentName=form.elements.student_name.value.trim();
    const contactKind=form.elements.contact_kind.value;
    const contactValue=form.elements.contact_value.value.trim();
    if(!payerName||!studentName||!contactKind||!contactValue){showError('Заполните поля заявки.');return;}
    if(contactKind==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue)){showError('Проверьте адрес электронной почты.');return;}
    if(!form.elements.offer_read.checked){showError('Подтвердите ознакомление с договором-офертой.');return;}
    if(!form.elements.processing_consent.checked){showError('Подтвердите согласие на обработку персональных данных.');return;}
    if(form.elements.website.value)return;
    const contactLabels={email:'Электронная почта',phone:'Телефон',messenger:'Мессенджер'};
    requestText=[
      'Заявка с repiq.ru/oge/zayavka/',
      'Услуга: '+service.label,
      'Имя заказчика: '+payerName,
      'Имя ученика: '+studentName,
      'Способ связи: '+contactLabels[contactKind],
      'Контакт: '+contactValue,
      'С договором-офертой ознакомлен(а): да (редакция '+service.offerVersion+')',
      'Согласие на обработку персональных данных: да (редакция '+service.consentVersion+')'
    ].join('\r\n');
    showError('');
    mailStep.hidden=false;
    const subject='Заявка: '+service.label;
    window.location.href='mailto:'+EMAIL+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(requestText);
  });
  copyButton.addEventListener('click',async()=>{
    if(!requestText)return;
    try{await navigator.clipboard.writeText(requestText);copyButton.textContent='Скопировано';}
    catch(_){manualCopy.value=requestText;manualCopy.hidden=false;manualCopy.focus();manualCopy.select();}
  });
})();

