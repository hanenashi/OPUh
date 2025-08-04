$(document).ready(function() {

	// dialog potvrzeni mazani
	$("[name='tl_smazat']").on("click", function(event) {
		if ($("[name='item[]']:checked").length === 0) {
			event.preventDefault();
			return;
		}
		
		if (!confirm("Opravdu chcete označené položky smazat? Tato akce je nevratná!")) {
			event.preventDefault();
		}
	});


	$('input[id^="htmlcode_"]').click(function() {
		this.select();
	});

	$('input[id^="html_"]').click(function() {
		this.select();
	});
	
	$('input[id^="link_"]').click(function() {
		this.select();
	});
	
	$('input[id^="delete_"]').click(function() {
		this.select();
	});


    $('#tl_odeslat').click(function() {
        if($('#obrazek').val().trim() !== '') {
            $('#uploading').show();
            $(this).hide();
        }
    });
	
    $('#tl_odeslat_hatetepe').click(function() {
        if($('#url').val().trim() !== '') {
            $('#uploading').show();
            $(this).hide();
        }
    });


    $('.js-star').on('click', function(){
        $star = $(this);
        $star.toggleClass('is-active');

        $.ajax({
            url: 'job.php',
            method: 'GET',
            data: {star_value: $star.val(), star_id: $star.attr('id')},
            success: function (response) {
                if(response == 1) {
                    $star.addClass('is-active');
					$star.val('1');
					$star.parent().parent().attr('class', 'boxtop');
                } else {
                    $star.removeClass('is-active');
					$star.val('0');
					$star.parent().parent().attr('class', 'box');
	            }
            }
        });
    });


	// Uchováváme pořadí zaškrtávání checkboxů
	let checkedOrder = [];

	// Sledujeme změny checkboxů a ukládáme pořadí
	$(document).on('change', 'input[name="item[]"]', function () {
		let id = $(this).val();

		if ($(this).is(':checked')) {
			// Přidáme na konec seznamu, pokud ještě není
			if (!checkedOrder.includes(id)) {
				checkedOrder.push(id);
			}
		} else {
			// Pokud checkbox byl odškrtnut, odstraníme ho ze seznamu
			checkedOrder = checkedOrder.filter(item => item !== id);
		}

		updateOverlays();
	});

	// Funkce pro aktualizaci overlay čísel
	function updateOverlays() {
		checkedOrder.forEach((id, index) => {
			let overlay = $(`#overlay_${id}`);
			overlay.text(index + 1).show(); // Nastavíme pořadí a zobrazíme
		});

		// Skryjeme overlay u checkboxů, které již nejsou v seznamu
		$('input[name="item[]"]').each(function () {
			let id = $(this).val();
			if (!checkedOrder.includes(id)) {
				$(`#overlay_${id}`).hide();
			}
		});
	}

	// Přidáme overlay do DOM po načtení stránky
	$('input[name="item[]"]').each(function () {
		let id = $(this).val();
		let parentBox = $(this).closest('div[class^="box"]'); // Hledáme box nebo boxtop

		if (parentBox.length) {
			// Vytvoříme overlay a přidáme ho do .box / .boxtop
			let overlay = $(`<span id="overlay_${id}" class="overlay"></span>`).hide();
			parentBox.css("position", "relative").append(overlay);
		}
	});

	// Univerzální obsluha kopírování přes tlačítka do schránky
	function handleCopy(button, filter = 'all') {
		if (button.hasClass('disabled')) return;

		button.addClass('disabled'); // Zablokujeme tlačítko během operace

		let values = [];
		const target = button.data('target');

		if (filter === 'single') {
			// Kopírování jednotlivého hidden inputu podle tlačítka
			const targetId = `#${target}`;
			const valueToCopy = $(targetId).val();
			values.push(valueToCopy);
		} else if (filter === 'checked') {
			// Kopírování hidden inputů podle pořadí zaškrtnutí checkboxů
			checkedOrder.forEach(id => {
				let hiddenInput = $(`#${target}${id}`);
				if (hiddenInput.length) {
					values.push(hiddenInput.val());
				}
			});
		} else {
			// Kopírování všech inputů podle prefixu
			$(`input[id^="${target}"]`).each(function () {
				values.push($(this).val());
			});
		}

		if (values.length === 0) {
			button.removeClass("disabled");
			return;
		}

		// Spojíme hodnoty do jednoho textu (pro hromadné kopírování)
		let valueToCopy = values.map((value, index) => {
			return index < values.length - 1 ? value + '<br><br>\r\n' : value;
		}).join('');

		// Zkopírování do schránky
		navigator.clipboard.writeText(valueToCopy).then(() => {
			updateButtonState(button);
		}).catch(() => {
			button.removeClass("disabled");
		});
	}

	// Pomocná funkce pro změnu stavu tlačítka
	function updateButtonState(button) {
		const originalText = button.text();
		const originalColor = button.css("color");

		button.text("✔").css({
			"background-color": "#28a745",
			"color": "white"
		});

		setTimeout(() => {
			button.text(originalText).css({
				"background-color": "#e6e6e6",
				"color": originalColor
			}).removeClass("disabled");
		}, 1000);
	}
	
	// Pověšení na události
	$("button.copy-btn").off("click").on("click", function () {
		handleCopy($(this), 'single');
	});

	$('[name^="collect_htmlcode_checked"]').off("click").on('click', function () {
		handleCopy($(this), 'checked');
	});

	$('[name^="collect_html_checked"]').off("click").on('click', function () {
		handleCopy($(this), 'checked');
	});

	$('[name^="collect_link_checked"]').off("click").on('click', function () {
		handleCopy($(this), 'checked');
	});

	$('#collect-link').off("click").on('click', function () {
		handleCopy($(this), 'all');
	});

	$('#collect-htmlcode').off("click").on('click', function () {
		handleCopy($(this), 'all');
	});


	// Obsluha zobrazení chyb. hlášení
	$alert = $('.custom-alert');

	// Zavírací logika pro křížek
	$alert.find('.close-btn').on('click', function () {
		closeAlert($alert);
	});
	
	// Zavírací logika pro tlačítko OK
	$alert.find('.ok-btn').on('click', function () {
		closeAlert($alert);
	});

	// Automatické skrytí
	setTimeout(() => {
		closeAlert($alert);
	}, 6500);

	// Funkce pro zavření alertu
	function closeAlert($alert) {
		$alert.addClass('fade-out'); // Přidáme animaci pro zmizení
		setTimeout(() => {
			$alert.remove(); // Po animaci alert odstraníme
		}, 500);
	}

});